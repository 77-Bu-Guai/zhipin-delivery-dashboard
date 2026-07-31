import {
  ExtensionRawData,
  PipelineRecord,
  DeliveryLog,
  DeductionStat,
  DEDUCTION_TYPE_MAP,
  DailyStatistics,
  AiScoringLog,
  AiDeductionCategory,
} from '@/types';
import { parseAiScoreMessage } from '@/utils/aiScoringParser';
import { devLog } from '@/lib/utils';
import { TIER_THRESHOLDS, TIER_LABELS } from '@/utils/scoringConstants';
import { setAICategoryData } from '@/utils/jobCategories';

/** 插件增量数据 _delta 字段的结构（仅取用到的部分） */
type ExtensionDelta = {
  'pipeline-cache'?: { data?: Record<string, unknown> };
  'ai-scoring-logs'?: AiScoringLog[];
};

// AI 岗位分类映射（由 scripts/classify-jobs.mjs 生成，MiMo 20 大类）
let jobCategoryMap: Record<string, string> = {};

/**
 * 加载导出的插件数据（流式异步，首屏不再内嵌 10.9MB 数据）。
 * 优先级：① Electron 打包环境走 IPC 读盘（file:// 下 fetch 本地 JSON 被 Chrome CORS 拦截，由 preload.cjs + ipcMain 桥接）；
 *        ② vite dev / vite preview / 普通浏览器走 XHR 实时请求（serve-json-files 中间件每次读最新文件）。
 * 包含重试机制，应对文件被并发写入时的读取冲突。
 */
/** 加载 MiMo 岗位分类映射（public/job-categories.json） */
async function loadJobCategories(): Promise<void> {
  try {
    const raw = await fetchJsonXHR('/job-categories.json');
    if (raw && (raw as { map?: Record<string, string> }).map) {
      const data = raw as { categories: { name: string; color: string }[]; map: Record<string, string> };
      jobCategoryMap = data.map || {};
      setAICategoryData({ categories: data.categories, map: jobCategoryMap });
      devLog.log(`🏷️ 加载岗位分类映射 ${Object.keys(jobCategoryMap).length} 条`);
    }
  } catch (err) {
    devLog.warn('岗位分类映射加载失败，回退关键词规则:', (err as Error).message);
  }
}

export async function loadExtensionData(): Promise<ExtensionRawData | null> {
  // 加载 AI 岗位分类映射（失败不影响主数据流，回退关键词规则）
  await loadJobCategories();

  // 流式加载：shell 先渲染，数据到位后填充（首屏 HTML 不再内嵌 10.9MB 数据）
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await fetchExtensionData();
      if (!raw) {
        devLog.warn('extension-data.json 未找到，请先运行 npm run export-data');
        return null;
      }
      const data = raw as ExtensionRawData;
      devLog.log('📦 加载完成，_meta:', data['_meta'] || data._meta);
      devLog.log('📦 pipeline-cache 存在:', 'pipeline-cache' in data);
      return data;
    } catch (err) {
      console.error(`加载插件数据失败 (${attempt}/${MAX_RETRIES}):`, err);
      if (attempt < MAX_RETRIES) {
        const wait = attempt * 1000;
        devLog.log(`⏳ ${wait}ms 后重试...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  return null;
}

/**
 * 统一数据获取入口：
 * - Electron 打包环境（window.electronAPI 存在）→ 主进程从磁盘读文件经 IPC 回传（绕过 file:// 的 fetch 限制）；
 * - 其余（vite dev / vite preview / 普通浏览器）→ XHR 实时请求。
 */
async function fetchExtensionData(): Promise<unknown> {
  const api = (window as unknown as {
    electronAPI?: { readDataFile?: (p: string) => Promise<unknown> };
  }).electronAPI;
  if (api?.readDataFile) {
    try {
      const text = (await api.readDataFile('extension-data.json')) as string | null;
      if (text) {
        devLog.log('📦 使用 Electron IPC 读盘数据');
        return JSON.parse(text);
      }
    } catch (e) {
      devLog.warn('Electron IPC 读盘失败，回退 XHR:', (e as Error).message);
    }
  }
  return fetchJsonXHR('/extension-data.json');
}

/** 用 XMLHttpRequest 加载 JSON（比 fetch 更稳定，避免 ERR_ABORTED） */
function fetchJsonXHR(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${url}?_t=${ts}`, true);
    xhr.responseType = 'json';
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        resolve(null);
      }
    };
    xhr.onerror = () => reject(new Error(`XHR 失败: ${url}`));
    xhr.ontimeout = () => reject(new Error(`XHR 超时: ${url}`));
    xhr.timeout = 30000;
    xhr.send();
  });
}

/** 归一化公司/岗位名称，用于模糊匹配 */
const PROCESSOR_LABELS: Record<string, string> = {
  aiFiltering: 'AI筛选',
  amap: '工作地址筛选',
  activityFilter: '活跃度筛选',
  basic: '基础筛选',
  company: '公司筛选',
  salaryRange: '薪资筛选',
  jobContent: 'AI内容筛选',
  jobTitle: '岗位标题筛选',
};

function getFilterStateName(
  processorType: string,
  status: string,
  message: string,
  aiScoring?: AiScoringLog,
): string {
  if (status === 'success') return '投递成功';
  // 优先用 processorType 映射（稳定的过滤类型）
  if (processorType && PROCESSOR_LABELS[processorType]) {
    return PROCESSOR_LABELS[processorType];
  }

  // 非成功记录：优先用 AI 评分日志的 state_name（与插件侧分类一致）
  const aiStateName = aiScoring?.state_name || '';
  if (aiStateName && aiStateName !== '投递成功') {
    // 统一命名：活跃度过滤 → 活跃度筛选
    return aiStateName === '活跃度过滤' ? '活跃度筛选' : aiStateName;
  }

  // 无有效 state_name 时，从 message 兜底识别
  const msg = (message || '').trim();
  if (msg.startsWith('不活跃') || msg.includes('无活跃内容')) return '活跃度筛选';
  if (msg.includes('直线距离超标')) return '工作地址筛选';
  if (msg.includes('猎头过滤')) return '猎头过滤';
  if (msg.includes('不匹配的薪资范围')) return '薪资筛选';
  if (msg.includes('您今天已与') || msg.includes('150位BOSS')) return '达到限制';
  if (msg.startsWith('分数')) return 'AI筛选';
  if (
    msg.startsWith('错误:') ||
    msg.includes('Failed to fetch') ||
    msg.includes('timed out') ||
    msg.includes('预期外') ||
    msg.includes('状态码: 429') ||
    msg.includes('Request was rejected due to rate limiting') ||
    msg === '用户中止'
  ) {
    return '未知错误';
  }
  // 无法识别 → 一律归为"系统筛选"
  // 不暴露 pipeline message 原始内容（避免几十个细碎分类）
  return '系统筛选';
}

/** 将 pipeline-cache 记录转换为 DeliveryLog */
export function parsePipelineToLogs(data: ExtensionRawData): DeliveryLog[] {
  const pipeline = data['pipeline-cache'];
  if (!pipeline?.data) return [];

  const aiScoringLogs = getAiScoringLogs(data);
  // 只按 encryptJobId 精确匹配；同一 ID 取时间最新的评分记录
  const scoringByJobId: Record<string, AiScoringLog> = {};
  if (aiScoringLogs) {
    for (const log of aiScoringLogs) {
      if (!log.encryptJobId) continue;
      const existing = scoringByJobId[log.encryptJobId];
      if (!existing || (log.time || 0) > (existing.time || 0)) {
        scoringByJobId[log.encryptJobId] = log;
      }
    }
  }

  return Object.values(pipeline.data).map((record: PipelineRecord & { _source?: string }) => {
    // 直接使用插件原始 status/message，不做二次判断
    // success=投递成功, warn=被筛掉, error=投递失败, 其他=待处理
    let status: 'success' | 'failed' | 'screened' | 'pending';
    if (record.status === 'success') {
      status = 'success';
    } else if (record.status === 'warn') {
      status = 'screened';
    } else if (record.status === 'error') {
      status = 'failed';
    } else if (record.message === '沟通中') {
      status = 'pending';
    } else {
      status = 'pending';
    }

    // 从记录的 _source 字段获取浏览器来源
    const browser = (record._source === 'chrome' || record._source === 'firefox')
      ? record._source as 'chrome' | 'firefox'
      : undefined;

    // 只按 encryptJobId 精确匹配 AI 评分
    let aiScoring = scoringByJobId[record.encryptJobId] || undefined;

    // 兼容 Firefox / 旧版插件：pipeline.message 里直接带有评分文本时，
    // 构造一个临时的 aiScoring 对象供 UI 解析，避免显示 "--"
    const recordMessageHasScore =
      record.message && /^分数[：:]?\s*(-?\d+|NaN)/.test(record.message);
    if (!aiScoring && recordMessageHasScore) {
      aiScoring = {
        time: record.createdAt,
        encryptJobId: record.encryptJobId,
        jobName: record.jobName,
        companyName: record.brandName,
        state: record.status === 'success' ? 'success' : 'warning',
        state_name: 'AI筛选',
        message: record.message,
        errMsg: '',
        errState: '',
      };
    }

    // 只有 AI 过滤的记录才用 AI 评分重分类（地址/活跃度/薪资过滤不受 AI 影响）
    // 也兼容 Chrome 旧数据：processorType 为空但 message 是评分文本
    const isAiScoringRecord =
      record.processorType === 'aiFiltering' || recordMessageHasScore;
    if (aiScoring && isAiScoringRecord) {
      const scoreText = aiScoring.message || aiScoring.errMsg || '';
      const scoreMatch = scoreText.match(/分数[：:]?\s*(-?\d+)/);
      if (scoreMatch) {
        const aiScore = parseInt(scoreMatch[1], 10);
        if (aiScore < 20) {
          status = 'failed';
        }
      }
    }

    // 过滤原因：processorType → AI 评分 state_name → message 兜底
    const filterStateName = getFilterStateName(
      record.processorType,
      status,
      record.message,
      aiScoring,
    );

    return {
      id: record.encryptJobId,
      timestamp: new Date(record.createdAt).toISOString(),
      companyName: record.brandName,
      jobTitle: record.jobName,
      status,
      message: record.message,
      processorType: record.processorType,
      encryptJobId: record.encryptJobId,
      browser,
      jd: generateJDSummary(record),
      bonusPoints: generateBonusPoints(record, aiScoring),
      aiScoring,
      dataSource: 'pipeline',
      filterStateName,
      jobCategory: jobCategoryMap[record.jobName] || undefined,
    };
  });
}

/** 从真实数据生成 JD 摘要 */
function generateJDSummary(record: PipelineRecord): string {
  return `【岗位信息】
公司：${record.brandName}
岗位：${record.jobName}
投递状态：${record.message || '沟通中'}
处理方式：${record.processorType || '自动投递'}

【投递记录】
投递时间：${new Date(record.createdAt).toLocaleString('zh-CN')}
命中次数：${record.hitCount || 0} 次
最后访问：${new Date(record.lastAccessed).toLocaleString('zh-CN')}

【来自 Boss 直聘】
该数据由 Boss 直聘自动投递插件导出，完整 JD 请前往 Boss 直聘官网查看。`;
}

/** 从原始数据生成加分项 — 按 message 区分，并把 AI 筛选的具体原因展示出来 */
function generateBonusPoints(record: PipelineRecord, aiScoring?: AiScoringLog) {
  const points = [];
  if (record.status === 'success' || record.message === '沟通中') {
    points.push({ category: 'AI筛选通过', description: '通过插件 AI 内容筛选，匹配度达标', matched: true });
  }
  if (record.processorType && record.processorType !== 'none') {
    points.push({ category: '自动处理', description: `通过「${record.processorType}」处理器自动投递`, matched: true });
  }
  if (record.hitCount > 0) {
    points.push({ category: '重复命中', description: `该岗位曾被命中 ${record.hitCount} 次，匹配度较高`, matched: true });
  }
  // 筛掉的记录：按实际 message 说明原因
  if (record.status === 'warn') {
    let reason = record.message || '评分不达标';
    // AI 筛选：尝试从 aiScoring 取出具体原因
    if (record.message === 'AI筛选' && aiScoring?.message) {
      const parsed = parseAiScoreMessage(aiScoring.message);
      if (parsed && parsed.negativeItems.length > 0) {
        reason = parsed.negativeItems[0].reason.replace(/\/(\d+)分$/, '').trim();
      }
    }
    points.push({ category: 'AI筛选未通过', description: `筛选原因：${reason}`, matched: false });
  } else if (record.status !== 'success' && record.message !== '沟通中') {
    points.push({ category: '筛选未通过', description: `筛选结果：${record.message || '未知原因'}`, matched: false });
  }
  return points;
}

/**
 * 从每日统计聚合扣分项统计（来自 web-geek-job-Statistics 聚合表）
 */
export function parseStatisticsToDeductions(data: ExtensionRawData): DeductionStat[] {
  const stats = data['web-geek-job-Statistics'];
  if (!stats || stats.length === 0) return [];

  const deductionKeys = [
    'activityFilter', 'amap', 'company', 'companySizeRange',
    'goldHunterFilter', 'hrPosition', 'jobAddress', 'jobContent',
    'jobTitle', 'repeat', 'salaryRange',
  ];

  const aggregated: Record<string, number> = {};
  for (const day of stats) {
    for (const key of deductionKeys) {
      const value = (day as unknown as Record<string, number>)[key] || 0;
      if (value > 0) aggregated[key] = (aggregated[key] || 0) + value;
    }
  }

  const total = Object.values(aggregated).reduce((a, b) => a + b, 0);

  return Object.entries(aggregated)
    .map(([key, count]) => ({
      type: DEDUCTION_TYPE_MAP[key] || key,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      affectedLogIds: [],
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 从每条投递记录的 message 字段生成扣分项统计
 * 扣分原因 = 记录的 message 内容（排除"投递成功"、"沟通中"、"等待中"等非扣分项）
 */
export function parseDeductionsFromLogs(logs: DeliveryLog[]): DeductionStat[] {
  if (logs.length === 0) return [];

  // 排除非扣分项的消息
  const excludeMessages = ['投递成功', '沟通中', '等待中', ''];

  const messageCounts: Record<string, { count: number; ids: string[] }> = {};

  for (const log of logs) {
    const msg = log.message?.trim() || '';
    if (excludeMessages.includes(msg)) continue;

    if (!messageCounts[msg]) {
      messageCounts[msg] = { count: 0, ids: [] };
    }
    messageCounts[msg].count++;
    messageCounts[msg].ids.push(log.id);
  }

  const total = Object.values(messageCounts).reduce((a, b) => a + b.count, 0);

  return Object.entries(messageCounts)
    .map(([type, data]) => ({
      type,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      affectedLogIds: data.ids,
    }))
    .sort((a, b) => b.count - a.count);
}

/** 获取数据来源信息 */
export function getDataSources(data: ExtensionRawData): { chrome: boolean; firefox: boolean } {
  const meta = (data['_meta'] || data._meta) as { sources?: { chrome?: boolean; firefox?: boolean } } | undefined;
  return {
    chrome: meta?.sources?.chrome ?? false,
    firefox: meta?.sources?.firefox ?? false,
  };
}

/** 获取每日统计 */
export function getDailyStats(data: ExtensionRawData): DailyStatistics[] {
  return data['web-geek-job-Statistics'] || [];
}

/** 获取今日统计 */
export function getTodayStats(data: ExtensionRawData) {
  return data['web-geek-job-Today'] || null;
}

/** 获取 AI 评分详细日志（合并主区和 _delta 区）
 *  同一 encryptJobId 可能有多条记录（重试/重复投递/402 失败后重跑），保留时间最新的一条。
 */
export function getAiScoringLogs(data: ExtensionRawData): AiScoringLog[] | null {
  const main = (data['ai-scoring-logs'] as AiScoringLog[]) || [];
  const delta = data._delta?.['ai-scoring-logs'] as AiScoringLog[] | undefined;

  // 无论 delta 是否存在，都对合并后的结果按 encryptJobId 去重，保留时间最新的一条
  const map = new Map<string, AiScoringLog>();
  for (const log of main) {
    if (!log.encryptJobId) continue;
    const existing = map.get(log.encryptJobId);
    if (!existing || (log.time || 0) > (existing.time || 0)) {
      map.set(log.encryptJobId, log);
    }
  }
  if (delta) {
    for (const log of delta) {
      if (!log.encryptJobId) continue;
      const existing = map.get(log.encryptJobId);
      if (!existing || (log.time || 0) > (existing.time || 0)) {
        map.set(log.encryptJobId, log);
      }
    }
  }
  const merged = Array.from(map.values());
  return merged.length > 0 ? merged : null;
}

/**
 * 加载增量数据（从 extension-delta.json，文件仅几 KB，避免拉取 3.3MB 全量）
 * 包含重试机制，应对文件被并发写入时的读取冲突
 */
export async function loadExtensionDelta(): Promise<{
  newLogs: DeliveryLog[];
  newAiScoring: AiScoringLog[];
} | null> {
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await fetchJsonXHR('/extension-delta.json');
      if (!data) {
        // delta 文件不存在（旧版导出脚本还没生成），回退到全量方式
        devLog.warn('extension-delta.json 不存在，回退到全量读取');
        return fallbackDeltaFromFull();
      }
      const d = data as { _delta?: ExtensionDelta; _meta?: unknown };
      const delta = d._delta;
      const pipelineCache = delta?.['pipeline-cache'];
      if (!delta || !pipelineCache?.data || Object.keys(pipelineCache.data).length === 0) {
        return { newLogs: [], newAiScoring: [] };
      }

      const newPipeline: Record<string, unknown> = { 'pipeline-cache': delta['pipeline-cache'] };
      const newAiScoring = (delta['ai-scoring-logs'] as AiScoringLog[]) || [];
      if (newAiScoring.length > 0) {
        newPipeline['ai-scoring-logs'] = newAiScoring;
      }

      const newLogs = parsePipelineToLogs(newPipeline);
      return { newLogs, newAiScoring };
    } catch (err) {
      console.error(`加载增量数据失败 (${attempt}/${MAX_RETRIES}):`, err);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  // 增量重试耗尽，回退到全量读取
  return fallbackDeltaFromFull();
}

/** 回退方案：从全量文件提取增量（兼容旧版导出脚本） */
async function fallbackDeltaFromFull(): Promise<{
  newLogs: DeliveryLog[];
  newAiScoring: AiScoringLog[];
} | null> {
  try {
    const data = await fetchJsonXHR('/extension-data.json');
    if (!data) return null;
    const d = data as { _delta?: ExtensionDelta };
    const delta = d._delta;
    const pipelineCache = delta?.['pipeline-cache'];
    if (!delta || !pipelineCache?.data || Object.keys(pipelineCache.data).length === 0) {
      return { newLogs: [], newAiScoring: [] };
    }
    const newPipeline: Record<string, unknown> = { 'pipeline-cache': delta['pipeline-cache'] };
    const newAiScoring = (delta['ai-scoring-logs'] as AiScoringLog[]) || [];
    if (newAiScoring.length > 0) newPipeline['ai-scoring-logs'] = newAiScoring;
    return { newLogs: parsePipelineToLogs(newPipeline), newAiScoring };
  } catch {
    return null;
  }
}

/** 扣分类别关键词映射 — 越靠前优先级越高 */
const DEDUCTION_CATEGORIES: { keywords: RegExp; category: string }[] = [
  // 单休/大小周 — 优先匹配（影响最大）
  { keywords: /单休|大小周/, category: '单休/大小周' },

  // 提成薪资问题（底薪+提成/提成导向）
  { keywords: /底薪.*提成|提成.*导向|无底薪|纯提成|收入上不封顶|薪资偏低/, category: '提成薪资模式' },

  // 学历不符
  { keywords: /大专|本科及以上|研究生|硕士|博士|留学|海归|法学.*学历|专业不符/, category: '学历不符' },

  // 语言/证书要求
  { keywords: /英语|外语|小语种|英文|CET|四级|六级|驾驶证|驾照|普通话|证书/, category: '语言/证书要求' },

  // 销售/陌拜/电销
  { keywords: /销售|陌拜|电销|BD|地推|客户开发|业务拓展|电话推销/, category: '销售/陌拜/电销' },

  // 出差/驻外
  { keywords: /出差|驻外|外派/, category: '出差/驻外' },

  // 夜班/轮班
  { keywords: /夜班|轮班|倒班|晚班/, category: '夜班/轮班' },

  // 居家办公限制
  { keywords: /不接受居家|不接受远程|现场办公|到岗/, category: '不接受居家/远程' },

  // 跨境电商/货代（行业方向不符）
  { keywords: /跨境电商|货代|亚马逊|速卖通|Shopee|海外仓|FBA|外贸/, category: '跨境电商/外贸' },

  // 会计/财务
  { keywords: /会计|财务|财报|ERP|财会|审计|税务/, category: '会计/财务' },

  // 人力/HR/猎头
  { keywords: /人力|HR|猎头|招聘|HRBP/, category: '人力/HR' },

  // 狼性文化/高压/加班
  { keywords: /抗压|狼性|加班|吃苦|高强度|996|ICU/, category: '狼性文化/高压' },

  // 硬件/电子/工程/芯片
  { keywords: /硬件|电子|半导体|芯片|机械|电路|CAD|SolidWorks|机器人|电子信息/, category: '硬件/电子/工程' },

  // 纯技术（开发无业务）
  { keywords: /纯代码|算法|纯开发|无.*业务/, category: '纯技术/无业务' },

  // 传统行业/非IT
  { keywords: /传统行业|非数字化|非IT|制造业|工厂|车间/, category: '传统行业/非IT' },

  // 轮岗/职责不清晰
  { keywords: /轮岗|多面手|综合岗/, category: '轮岗/职责不清晰' },

  // 弹性工作风险
  { keywords: /弹性工作|随叫随到/, category: '弹性工作风险' },

  // 年龄限制
  { keywords: /年龄|岁以下|岁以上/, category: '年龄限制' },

  // 实习生岗位
  { keywords: /实习生|实习岗/, category: '实习生岗位' },

  // 自带资源/客户
  { keywords: /自带客户|自带资源|资源要求/, category: '自带资源要求' },

  // 岗位职责与岗位名严重脱节
  { keywords: /岗位名.*脱节|岗位职责.*脱节|严重不符/, category: '岗位名与职责脱节' },

  // JD 写得空洞
  { keywords: /笼统|空洞|全空话|模糊|不清晰/, category: 'JD空洞' },

  // 工作地点偏远
  { keywords: /工作地点|通勤|坪山|大鹏|龙岗|光明|偏远|较多外勤|频繁外出/, category: '工作地点偏远' },

  // 单双休（5.5天制）
  { keywords: /5\.5天|弹性排班|核心覆盖/, category: '5.5天制/弹性排班' },

  // 外包/派遣
  { keywords: /第三方编制|外包|派遣|劳务派遣/, category: '外包/派遣岗位' },

  // 平台经验 (天猫/京东/抖音等)
  { keywords: /天猫|京东|淘宝|抖音|拼多多|亚马逊/, category: '平台经验要求' },

  // 运营经验年限要求
  { keywords: /2年以上|3年以上|1年.*经验|运营经验/, category: '运营经验年限' },

  // UI/美工/设计
  { keywords: /UI|美工|作品集|平面设计|视觉设计/, category: 'UI/美工' },

  // 电话面试/远程沟通
  { keywords: /电话面试|远程面试/, category: '电话面试/远程' },

  // 经验要求不符
  { keywords: /应届|经验.*年|工作经验|实习时间/, category: '经验要求不符' },

  // 薪资面议
  { keywords: /薪资面议/, category: '薪资面议' },

  // 社保问题
  { keywords: /无社保|不交社保/, category: '社保问题' },
];

const DEDUCTION_DEFAULT_CATEGORY = '其他';

/**
 * 解析单条 AI 评分消息中的扣分项
 * 输入格式：
 *   分数-260
 *   消极:
 *   工作经验要求1-3年，不符合应届生身份/(100分)
 *   岗位职责包含电话沟通.../(200分)
 *   积极:
 *   ...
 */
function parseDeductionLines(message: string): { reason: string; score: number; category: string }[] {
  const results: { reason: string; score: number; category: string }[] = [];

  // 提取消极部分
  const negMatch = message.match(/消极:\n([\s\S]*?)(?=\n积极:|$)/);
  if (!negMatch) return results;

  const lines = negMatch[1].split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // 提取原因：匹配 /(N分) 或 /N分 或 （N分）结尾格式，提取前面的文本作为原因
    let reason = line;
    // 优先匹配 /(N分) 或 /N分 或 （N分）结尾
    const reasonEndMatch = line.match(/^(.+?)\s*[（(]\s*\/?\s*\d+\s*分\s*[）)]\s*$/);
    if (reasonEndMatch) {
      reason = reasonEndMatch[1].trim();
    } else {
      const reasonSlashMatch = line.match(/^(.+?)\/(\d+)分$/);
      if (reasonSlashMatch) {
        reason = reasonSlashMatch[1].trim();
      }
    }
    if (!reason || reason.length < 2) continue;

    // 提取分数
    const scoreMatch = line.match(/[（(]?\s*\/?\s*(\d+)\s*分\s*[）)]?$/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // 归类
    let category = DEDUCTION_DEFAULT_CATEGORY;
    for (const rule of DEDUCTION_CATEGORIES) {
      if (rule.keywords.test(reason)) {
        category = rule.category;
        break;
      }
    }

    results.push({ reason, score, category });
  }

  return results;
}

/**
 * 从已解析的投递日志中提取 AI 评分扣分项统计
 * 遍历每条日志的 aiScoring.message，解析扣分项并归类统计
 */
export function parseAiDeductionsFromLogs(logs: DeliveryLog[]): AiDeductionCategory[] {
  const catMap = new Map<string, { count: number; totalScore: number; examples: string[]; ids: Set<string> }>();

  for (const log of logs) {
    if (!log.aiScoring?.message) continue;
    const msg = log.aiScoring.message;
    if (!msg.includes('分数') || !msg.includes('消极')) continue;

    const deductions = parseDeductionLines(msg);
    for (const d of deductions) {
      if (!catMap.has(d.category)) {
        catMap.set(d.category, { count: 0, totalScore: 0, examples: [], ids: new Set() });
      }
      const entry = catMap.get(d.category)!;
      entry.count++;
      entry.totalScore += d.score;
      entry.ids.add(log.id);
      if (entry.examples.length < 3) {
        entry.examples.push(d.reason);
      }
    }
  }

  const total = Array.from(catMap.values()).reduce((s, v) => s + v.count, 0);

  return Array.from(catMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      totalScore: data.totalScore,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      examples: data.examples,
      affectedLogIds: Array.from(data.ids),
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================
// 按分数等级分组 — 不依赖关键词，提示词变化也稳定
// ============================================================

export interface TierBucket {
  tier: 'fatal' | 'major' | 'minor' | 'minor-minus' | 'trivial';
  label: string;
  count: number;
  totalScore: number;
  examples: { reason: string; score: number; jobId: string; jobTitle: string; companyName: string }[];
  affectedLogIds: string[];
}

/** 分档阈值统一收敛到 scoringConstants.ts 的 TIER_THRESHOLDS（致命 ≥ FATAL_DEDUCTION_THRESHOLD，见该文件注释）。 */
function getScoreTier(score: number): TierBucket['tier'] {
  if (score >= TIER_THRESHOLDS.fatal) return 'fatal';
  if (score >= TIER_THRESHOLDS.major) return 'major';
  if (score >= TIER_THRESHOLDS.minor) return 'minor';
  if (score >= TIER_THRESHOLDS.minorMinus) return 'minor-minus';
  return 'trivial';
}

/**
 * 按分数等级分组所有扣分项（不依赖任何关键词）
 * 提示词怎么改都不会失效，因为分组只看分值
 */
export function parseDeductionsByTier(logs: DeliveryLog[]): TierBucket[] {
  const tierMap: Record<TierBucket['tier'], TierBucket> = {
    'fatal': { tier: 'fatal', label: TIER_LABELS.fatal, count: 0, totalScore: 0, examples: [], affectedLogIds: [] },
    'major': { tier: 'major', label: TIER_LABELS.major, count: 0, totalScore: 0, examples: [], affectedLogIds: [] },
    'minor': { tier: 'minor', label: TIER_LABELS.minor, count: 0, totalScore: 0, examples: [], affectedLogIds: [] },
    'minor-minus': { tier: 'minor-minus', label: TIER_LABELS['minor-minus'], count: 0, totalScore: 0, examples: [], affectedLogIds: [] },
    'trivial': { tier: 'trivial', label: TIER_LABELS.trivial, count: 0, totalScore: 0, examples: [], affectedLogIds: [] },
  };

  for (const log of logs) {
    if (!log.aiScoring?.message) continue;
    const msg = log.aiScoring.message;
    if (!msg.includes('分数') || !msg.includes('消极')) continue;

    const lines = parseDeductionLinesRaw(msg);
    for (const d of lines) {
      const tier = getScoreTier(d.score);
      const bucket = tierMap[tier];
      bucket.count++;
      bucket.totalScore += d.score;
      if (!bucket.affectedLogIds.includes(log.id)) bucket.affectedLogIds.push(log.id);
      if (bucket.examples.length < 5) {
        bucket.examples.push({
          reason: d.reason,
          score: d.score,
          jobId: log.id,
          jobTitle: log.jobTitle,
          companyName: log.companyName,
        });
      }
    }
  }

  return Object.values(tierMap).filter(b => b.count > 0);
}

/** 提取所有扣分项（不分类，按原始行） */
function parseDeductionLinesRaw(message: string): { reason: string; score: number }[] {
  const results: { reason: string; score: number }[] = [];
  const negMatch = message.match(/消极:\n([\s\S]*?)(?=\n积极:|$)/);
  if (!negMatch) return results;

  const lines = negMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let reason = line;
    const m1 = line.match(/^(.+?)\s*[（(]\s*\/?\s*\d+\s*分\s*[）)]\s*$/);
    const m2 = line.match(/^(.+?)\/(\d+)分$/);
    if (m1) reason = m1[1].trim();
    else if (m2) reason = m2[1].trim();
    if (!reason || reason.length < 2) continue;
    const scoreM = line.match(/[（(]?\s*\/?\s*(\d+)\s*分/);
    const score = scoreM ? parseInt(scoreM[1], 10) : 0;
    if (score > 0) results.push({ reason, score });
  }
  return results;
}

/** 按分数等级分组所有加分项 */
export function parsePositivesByTier(logs: DeliveryLog[]): { total: number; totalScore: number; examples: { reason: string; score: number; jobTitle: string; companyName: string }[] } {
  let total = 0;
  let totalScore = 0;
  const examples: { reason: string; score: number; jobTitle: string; companyName: string }[] = [];

  for (const log of logs) {
    if (!log.aiScoring?.message) continue;
    const msg = log.aiScoring.message;
    const posMatch = msg.match(/积极:\n([\s\S]*)$/);
    if (!posMatch) continue;

    const lines = posMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      let reason = line;
      const m1 = line.match(/^(.+?)\s*[（(]\s*\/?\s*\d+\s*分\s*[）)]\s*$/);
      const m2 = line.match(/^(.+?)\/(\d+)分$/);
      if (m1) reason = m1[1].trim();
      else if (m2) reason = m2[1].trim();
      if (!reason || reason.length < 2) continue;
      const scoreM = line.match(/[（(]?\s*\/?\s*(\d+)\s*分/);
      const score = scoreM ? parseInt(scoreM[1], 10) : 0;
      if (score > 0) {
        total++;
        totalScore += score;
        if (examples.length < 8) {
          examples.push({ reason, score, jobTitle: log.jobTitle, companyName: log.companyName });
        }
      }
    }
  }

  return { total, totalScore, examples };
}

/**
 * 从 AI 导出的合并分类映射构建 AiDeductionCategory 列表
 * @param catMap - { 原始扣分原因: { mergedKey: string, label: string } }
 */
export function buildCategoriesFromMap(
  catMap: Record<string, string | { mergedKey: string; label: string }>,
  logs: DeliveryLog[],
): AiDeductionCategory[] {
  const grouped = new Map<string, { count: number; totalScore: number; examples: string[]; ids: Set<string> }>();

  // 辅助函数：从 catMap 获取分类标签
  const getLabel = (reason: string): string => {
    const val = catMap[reason] || catMap[reason.replace(/^JD写[：:]\s*/, '').trim()];
    if (!val) return '其他';
    if (typeof val === 'string') return val;
    return val.label || val.mergedKey || '其他';
  };

  for (const log of logs) {
    if (!log.aiScoring?.message) continue;
    const msg = log.aiScoring.message;
    if (!msg.includes('消极')) continue;

    const lines = parseDeductionLinesRaw(msg);
    for (const d of lines) {
      const category = getLabel(d.reason);

      if (!grouped.has(category)) {
        grouped.set(category, { count: 0, totalScore: 0, examples: [], ids: new Set() });
      }
      const entry = grouped.get(category)!;
      entry.count++;
      entry.totalScore += d.score;
      entry.ids.add(log.id);
      if (entry.examples.length < 3) entry.examples.push(d.reason);
    }
  }

  const total = Array.from(grouped.values()).reduce((s, v) => s + v.count, 0);

  return Array.from(grouped.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      totalScore: data.totalScore,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      examples: data.examples,
      affectedLogIds: Array.from(data.ids),
    }))
    .sort((a, b) => b.count - a.count);
}
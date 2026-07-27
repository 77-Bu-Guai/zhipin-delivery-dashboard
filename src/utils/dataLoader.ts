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

/**
 * 加载导出的插件数据。
 * 生产环境优先使用构建时嵌入的 window.__EMBEDDED_DATA__（vite embed-data 插件注入），
 * 开发环境通过 XHR 请求 vite middleware（每次都读最新文件，Cache-Control: no-cache）。
 * 包含重试机制，应对文件被并发写入时的读取冲突。
 */
export async function loadExtensionData(): Promise<ExtensionRawData | null> {
  // 生产环境：构建时嵌入的数据（vite.config.ts embed-data 插件注入到 HTML）
  const embedded = (window as any).__EMBEDDED_DATA__;
  if (embedded) {
    const data = embedded as ExtensionRawData;
    devLog.log('📦 使用嵌入数据，_meta:', data['_meta'] || data._meta);
    devLog.log('📦 pipeline-cache 存在:', 'pipeline-cache' in data);
    return data;
  }

  // 开发环境：XHR 请求 vite middleware
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await fetchJsonXHR('/extension-data.json');
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
  activityFilter: '活跃度过滤',
  basic: '基础筛选',
  company: '公司筛选',
  salaryRange: '薪资筛选',
  jobContent: 'AI内容筛选',
  jobTitle: '岗位标题筛选',
};

function getFilterStateName(processorType: string, status: string, message: string): string {
  if (status === 'success') return '投递成功';
  // 优先用 processorType 映射（稳定的过滤类型）
  if (processorType && PROCESSOR_LABELS[processorType]) {
    return PROCESSOR_LABELS[processorType];
  }
  // 没有处理器类型 或 不在映射表中 → 一律归为"系统筛选"
  // 不暴露 pipeline message 原始内容（避免几十个细碎分类）
  return '系统筛选';
}

/** 将 pipeline-cache 记录转换为 DeliveryLog */
export function parsePipelineToLogs(data: ExtensionRawData): DeliveryLog[] {
  const pipeline = data['pipeline-cache'];
  if (!pipeline?.data) return [];

  const aiScoringLogs = getAiScoringLogs(data);
  // 只按 encryptJobId 精确匹配（不再用公司+岗位名回退）
  const scoringByJobId: Record<string, AiScoringLog> = {};
  if (aiScoringLogs) {
    for (const log of aiScoringLogs) {
      if (log.encryptJobId) {
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
    const aiScoring = scoringByJobId[record.encryptJobId] || undefined;

    // 只有 AI 过滤的记录才用 AI 评分重分类（地址/活跃度/薪资过滤不受 AI 影响）
    if (aiScoring && record.processorType === 'aiFiltering') {
      const scoreText = aiScoring.message || aiScoring.errMsg || '';
      const scoreMatch = scoreText.match(/分数[：:]?\s*(-?\d+)/);
      if (scoreMatch) {
        const aiScore = parseInt(scoreMatch[1], 10);
        if (aiScore < 20) {
          status = 'failed';
        }
      }
    }

    // 过滤原因：用 pipeline 的 processorType，不用 aiScoring.state_name
    const filterStateName = getFilterStateName(record.processorType, status, record.message);

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

/** 获取 AI 评分详细日志（合并主区和 _delta 区） */
export function getAiScoringLogs(data: ExtensionRawData): AiScoringLog[] | null {
  const main = (data['ai-scoring-logs'] as AiScoringLog[]) || [];
  const delta = data._delta?.['ai-scoring-logs'] as AiScoringLog[] | undefined;
  if (!delta || delta.length === 0) return main.length > 0 ? main : null;
  if (main.length === 0) return delta;

  // 合并去重（按 encryptJobId）
  const seen = new Set(main.map(r => r.encryptJobId));
  const merged = [...main];
  for (const log of delta) {
    if (!seen.has(log.encryptJobId)) {
      merged.push(log);
      seen.add(log.encryptJobId);
    }
  }
  return merged;
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
      const d = data as { _delta?: any; _meta?: any };
      const delta = d._delta;
      if (!delta || !delta['pipeline-cache']?.data || Object.keys(delta['pipeline-cache'].data).length === 0) {
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
    const d = data as { _delta?: any };
    const delta = d._delta;
    if (!delta || !delta['pipeline-cache']?.data || Object.keys(delta['pipeline-cache'].data).length === 0) {
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

/** Tier boundaries:
 * 致命 ≥1000 | 重要 300-999 | 普通 100-299 | 轻微 50-99 | 微不足道 <50 | 加分正分
 */
function getScoreTier(score: number): TierBucket['tier'] {
  if (score >= 1000) return 'fatal';
  if (score >= 300) return 'major';
  if (score >= 100) return 'minor';
  if (score >= 50) return 'minor-minus';
  return 'trivial';
}

const TIER_LABELS: Record<TierBucket['tier'], string> = {
  'fatal': '致命扣分 (≥1000分)',
  'major': '重要扣分 (300-999分)',
  'minor': '普通扣分 (100-299分)',
  'minor-minus': '轻微扣分 (50-99分)',
  'trivial': '轻微扣分 (<50分)',
};

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
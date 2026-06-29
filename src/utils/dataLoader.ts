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

/**
 * 从 public/extension-data.json 加载导出的插件数据
 */
export async function loadExtensionData(): Promise<ExtensionRawData | null> {
  try {
    const response = await fetch('/extension-data.json', { cache: 'no-cache' });
    if (!response.ok) {
      console.warn('extension-data.json 未找到，请先运行 npm run export-data');
      return null;
    }
    const data = await response.json();
    console.log('📦 加载完成，_meta:', data['_meta'] || data._meta);
    console.log('📦 pipeline-cache 存在:', 'pipeline-cache' in data);
    return data;
  } catch (err) {
    console.error('加载插件数据失败:', err);
    return null;
  }
}

/**
 * 将 pipeline-cache 记录转换为 DeliveryLog
 * 同时匹配 AI 评分详细日志
 */
export function parsePipelineToLogs(data: ExtensionRawData): DeliveryLog[] {
  const pipeline = data['pipeline-cache'];
  if (!pipeline?.data) return [];

  const aiScoringLogs = getAiScoringLogs(data);
  // 按 encryptJobId 建立索引
  const scoringByJobId: Record<string, AiScoringLog> = {};
  if (aiScoringLogs) {
    for (const log of aiScoringLogs) {
      if (log.encryptJobId) {
        scoringByJobId[log.encryptJobId] = log;
      }
    }
  }

  return Object.values(pipeline.data).map((record: PipelineRecord & { _source?: string }) => {
    // warn = 被AI筛选掉（投递失败），success = 投递成功，error = 投递失败
    // 沟通中 = 仍在沟通中
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
      bonusPoints: generateBonusPoints(record),
      aiScoring: scoringByJobId[record.encryptJobId],
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

/** 从真实数据生成加分项 */
function generateBonusPoints(record: PipelineRecord) {
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
  if (record.status === 'warn') {
    points.push({ category: 'AI筛选未通过', description: `被AI筛选掉：${record.message || '评分不达标'}`, matched: false });
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

/** 获取 AI 评分详细日志 */
export function getAiScoringLogs(data: ExtensionRawData): AiScoringLog[] | null {
  return (data['ai-scoring-logs'] as AiScoringLog[]) || null;
}

/** 扣分类别关键词映射 */
const DEDUCTION_CATEGORIES: { keywords: RegExp; category: string }[] = [
  { keywords: /应届|经验.*年|工作经验/, category: '经验要求不符' },
  { keywords: /销售|陌拜|电销|BD|地推|客户开发|业务拓展|电话推销/, category: '销售/陌拜/电销' },
  { keywords: /硬件|电子|半导体|芯片|机械|电路|CAD|SolidWorks|机器人/, category: '硬件/电子/工程' },
  { keywords: /英语|外语|小语种|英文|CET|四级|六级/, category: '语言要求/证书' },
  { keywords: /出差|驻外|外派/, category: '出差/驻外' },
  { keywords: /单休|大小周/, category: '单休/大小周' },
  { keywords: /会计|财务|财报|ERP|财会/, category: '会计/财务' },
  { keywords: /人力|HR|猎头|招聘/, category: '人力/HR' },
  { keywords: /抗压|狼性|加班|吃苦|高强度/, category: '狼性文化/高压' },
  { keywords: /纯代码|算法|开发.*无.*业务/, category: '纯技术/无业务职责' },
  { keywords: /传统行业|非数字化|非IT/, category: '传统行业/非IT' },
  { keywords: /无底薪|纯提成|收入上不封顶/, category: '薪资结构问题' },
  { keywords: /轮岗|多面手|综合岗/, category: '轮岗/职责不清晰' },
  { keywords: /弹性工作|随叫随到/, category: '弹性工作风险' },
  { keywords: /实习生/, category: '实习生岗位' },
  { keywords: /薪资面议/, category: '薪资面议' },
  { keywords: /无社保|不交社保/, category: '社保问题' },
  { keywords: /自带客户|资源/, category: '自带资源要求' },
  { keywords: /岗位职责.*严重脱节|岗位名.*脱节/, category: '岗位名与职责脱节' },
  { keywords: /笼统|空洞|全空话|模糊/, category: 'JD空洞' },
  { keywords: /工作地点|通勤|坪山|大鹏/, category: '工作地点偏远' },
  { keywords: /UI|美工|作品集/, category: 'UI/美工' },
  { keywords: /电话面试/, category: '电话面试/远程' },
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
    // 提取原因
    const reasonMatch = line.match(/^(.+?)\/(?:\d+分|$)/);
    const reason = reasonMatch ? reasonMatch[1].trim() : line;
    if (!reason || reason.length < 2) continue;

    // 提取分数
    const scoreMatch = line.match(/\/\(?(\d+)分/);
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
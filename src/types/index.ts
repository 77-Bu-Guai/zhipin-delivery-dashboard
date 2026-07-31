// ====== 插件真实数据结构 ======

// pipeline-cache 中的单条投递记录
export interface PipelineRecord {
  brandName: string;
  createdAt: number;
  encryptJobId: string;
  expireAt: number;
  hitCount: number;
  jobName: string;
  lastAccessed: number;
  message: string;
  processorType: string;
  status: string;
}

// pipeline-cache 整体结构
export interface PipelineCache {
  data: Record<string, PipelineRecord>;
}

// 每日统计
export interface DailyStatistics {
  activityFilter: number;
  amap: number;
  company: number;
  companySizeRange: number;
  date: string;
  goldHunterFilter: number;
  hrPosition: number;
  jobAddress: number;
  jobContent: number;
  jobTitle: number;
  repeat: number;
  salaryRange: number;
  success: number;
  total: number;
}

// 今日统计
export interface TodayStatistics {
  activityFilter: number;
  amap: number;
  company: number;
  companySizeRange: number;
  date: string;
  goldHunterFilter: number;
  hrPosition: number;
  jobAddress: number;
  jobContent: number;
  jobTitle: number;
  repeat: number;
  salaryRange: number;
  success: number;
  total: number;
}

// BOSS API 导出记录
export interface BossApiRecord {
  id: string;
  jobTitle: string;
  companyName: string;
  status: string;
  message: string;
  timestamp: string;
  browser: string;
}

// 插件原始数据
export interface ExtensionRawData {
  'pipeline-cache'?: PipelineCache;
  'web-geek-job-Statistics'?: DailyStatistics[];
  'web-geek-job-Today'?: TodayStatistics;
  'web-geek-job-FormData'?: Record<string, unknown>;
  'ai-scoring-logs'?: AiScoringLog[];
  'boss-api-records'?: BossApiRecord[];
  // 增量数据（watch 模式）
  _delta?: {
    'pipeline-cache'?: PipelineCache;
    'ai-scoring-logs'?: AiScoringLog[];
    recordCount?: number;
    aiScoringCount?: number;
  };
  [key: string]: unknown;
}

// ====== 应用层数据结构 ======

// 扣分项类型映射
export const DEDUCTION_TYPE_MAP: Record<string, string> = {
  activityFilter: '活跃度筛选',
  amap: '工作地址筛选',
  company: '公司黑名单',
  companySizeRange: '公司规模筛选',
  goldHunterFilter: '金牌猎人筛选',
  hrPosition: 'HR职位筛选',
  jobAddress: '工作地址筛选',
  jobContent: 'AI内容筛选',
  jobTitle: '岗位标题筛选',
  repeat: '重复投递筛选',
  salaryRange: '薪资范围筛选',
};

// 投递日志
export interface DeliveryLog {
  id: string;
  timestamp: string;
  companyName: string;
  jobTitle: string;
  status: 'success' | 'failed' | 'screened' | 'pending';
  message: string;
  processorType: string;
  encryptJobId: string;
  // 模拟数据用字段
  browser?: 'chrome' | 'firefox';
  jd?: string;
  url?: string;
  bonusPoints?: BonusPoint[];
  deductions?: Deduction[];
  // AI 评分详细日志
  aiScoring?: AiScoringLog;
  // 数据来源标识
  dataSource?: 'pipeline' | 'web' | 'mock';
  // AI 大模型岗位分类（由 scripts/classify-jobs.mjs 生成，MiMo 按岗位名分 20 大类）
  jobCategory?: string;
  // 过滤原因（从 pipeline processorType 推导，更可靠）
  filterStateName: string;
}

// AI 评分详细日志（从浏览器内存中捕获）
export interface AiScoringLog {
  time: number;
  encryptJobId: string;
  jobName: string;
  companyName: string;
  state: string;          // "warning" | "success" | "error" | "info"
  state_name: string;     // "AI筛选" | "投递成功" | "工作地址筛选" | ...
  message: string;        // 详细评分文本: "分数-920\n消极:...\n积极:..."
  errMsg: string;         // 错误详情（AI 筛选时为完整评分文本）
  errState: string;       // "过滤" | ""
}

// 加分项（模拟数据用）
export interface BonusPoint {
  category: string;
  description: string;
  matched: boolean;
}

// 扣分项明细（模拟数据用）
export interface Deduction {
  type: string;
  reason: string;
  timestamp: string;
}

// 扣分项统计（来自每条投递记录的 message 字段）
export interface DeductionStat {
  type: string;          // 扣分原因中文名，如 "AI筛选"、"工作地址筛选"
  count: number;         // 出现次数
  percentage: number;    // 占比
  affectedLogIds: string[]; // 受影响的投递记录 ID 列表
}

// AI 评分扣分项（解析自 AiScoringLog.message）
export interface AiDeductionCategory {
  category: string;      // 扣分类别，如 "经验要求不符"、"销售/陌拜/电销"
  count: number;         // 出现次数
  totalScore: number;    // 总扣分数
  percentage: number;    // 占比
  examples: string[];    // 扣分原因示例
  affectedLogIds: string[]; // 受影响的投递记录 ID
}

// 筛选条件
export interface FilterOptions {
  browser: 'chrome' | 'firefox' | null;
  dateRange: [Date, Date] | null;
}
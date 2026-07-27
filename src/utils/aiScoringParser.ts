/**
 * AI 评分文本解析器 — v2
 *
 * 输入示例：
 *   分数-5715
 *   消极:
 *   JD写：9:00-18:30，单休/(5000分)
 *   JD写：底薪加提成，综合工资约3500～10000/(200分)
 *   ...
 *   积极:
 *   JD写：五险一金/(5分)
 *   ...
 *
 * 核心洞察：
 *   score = 积极分之和 - 消极分之和（验证 30/30 全通过）
 *   高频扣分 >=1000 分的项（单休/大小周）贡献 80%+ 的负分
 *   展示时应按分值排序，致命项高亮
 */

// ============================================================
// Type Definitions
// ============================================================

export interface AiScoreItem {
  reason: string;
  points: number; // 绝对值，永远正数
}

export interface AiDisplayItem {
  reason: string;
  points: number;
  /** 该项占所有消极/积极总分中的占比（百分比） */
  percentage: number;
}

export interface ParsedAiScore {
  totalScore: number;
  negativeItems: AiScoreItem[];
  positiveItems: AiScoreItem[];
  raw: string;
}

export interface AiDisplay {
  totalScore: number;
  grade: ScoreGrade;
  /** 按分值降序排列 */
  deductions: AiDisplayItem[];
  /** 按分值降序排列 */
  positives: AiDisplayItem[];
  totalNegPoints: number;
  totalPosPoints: number;
  /** >= 1000 分的扣分项数量 */
  fatalCount: number;
  /** 是否有 >= 1000 分的扣分项 */
  hasFatal: boolean;
  /** 最严重的扣分项（分值最大） */
  topDeduction: AiDisplayItem | null;
  raw: string;
}

export interface ScoreGrade {
  label: string;
  color: string;
  bg: string;
  /** CSS 类名，用于文字色 */
  textClass: string;
  /** CSS 类名，用于背景色 */
  bgClass: string;
  /** CSS 类名，用于边框色 */
  borderClass: string;
}

// ============================================================
// Grade System
// ============================================================

const GRADE_MAP: { threshold: number; label: string; text: string; bg: string; border: string }[] = [
  { threshold: 100,  label: 'S', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { threshold: 50,   label: 'A', text: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { threshold: 0,    label: 'B', text: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  { threshold: -100, label: 'C', text: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  { threshold: -500, label: 'D', text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
];

export function getScoreGrade(score: number): ScoreGrade {
  for (const g of GRADE_MAP) {
    if (score >= g.threshold) {
      return {
        label: g.label,
        color: g.text,
        bg: g.bg,
        textClass: g.text,
        bgClass: g.bg,
        borderClass: g.border,
      };
    }
  }
  // F 级：< -500
  return {
    label: 'F',
    color: 'text-red-600',
    bg: 'bg-red-50',
    textClass: 'text-red-600',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  };
}

// ============================================================
// Low-level Parsing
// ============================================================

export function parseAiScoreMessage(message: string): ParsedAiScore | null {
  if (!message || typeof message !== 'string') return null;

  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // 解析总分
  let totalScore = 0;
  const scoreLine = lines.find(l => l.startsWith('分数'));
  if (scoreLine) {
    const match = scoreLine.match(/分数[：:]?\s*(-?\d+)/);
    if (match) {
      totalScore = parseInt(match[1], 10);
    }
  }

  // 找消极/积极分界线
  let negativeStart = -1;
  let positiveStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('消极') || line.includes('扣分')) negativeStart = i;
    if (line.includes('积极') || line.includes('加分')) positiveStart = i;
  }

  // 提取消极项
  const negativeItems: AiScoreItem[] = [];
  if (negativeStart >= 0) {
    const endIdx = positiveStart >= 0 ? positiveStart : lines.length;
    for (let i = negativeStart + 1; i < endIdx; i++) {
      const item = parseAbsoluteScoreLine(lines[i]);
      if (item) negativeItems.push({ reason: item.reason, points: item.points });
    }
  }

  // 提取积极项
  const positiveItems: AiScoreItem[] = [];
  if (positiveStart >= 0) {
    for (let i = positiveStart + 1; i < lines.length; i++) {
      const item = parseAbsoluteScoreLine(lines[i]);
      if (item) positiveItems.push({ reason: item.reason, points: item.points });
    }
  }

  return { totalScore, negativeItems, positiveItems, raw: message };
}

function parseAbsoluteScoreLine(line: string): { reason: string; points: number } | null {
  if (!line) return null;
  const match = line.match(/^(.+?)\s*[（(]\s*\/?\s*(-?\d+)\s*分\s*[）)]\s*$/) || line.match(/^(.+?)\/(\d+)分$/);
  if (match) {
    const reason = match[1].trim();
    const points = Math.abs(parseInt(match[2], 10));
    return { reason, points };
  }
  return null;
}

// ============================================================
// Display-oriented Parsing (NEW)
// ============================================================

/**
 * 针对"是否值得投递"问题的展示解析
 * 扣分项按分值降序，致命项（>=1000 分）高亮
 */
export function parseAiScoreForDisplay(message: string): AiDisplay | null {
  const parsed = parseAiScoreMessage(message);
  if (!parsed) return null;

  const totalNegPoints = parsed.negativeItems.reduce((s, i) => s + i.points, 0);
  const totalPosPoints = parsed.positiveItems.reduce((s, i) => s + i.points, 0);

  // Deductions sorted by value DESC
  const deductions: AiDisplayItem[] = parsed.negativeItems
    .map(d => ({
      reason: simplifyReason(d.reason),
      points: d.points,
      percentage: totalNegPoints > 0 ? Math.round((d.points / totalNegPoints) * 100) : 0,
    }))
    .sort((a, b) => b.points - a.points);

  // Positives sorted by value DESC
  const positives: AiDisplayItem[] = parsed.positiveItems
    .map(p => ({
      reason: simplifyReason(p.reason),
      points: p.points,
      percentage: totalPosPoints > 0 ? Math.round((p.points / totalPosPoints) * 100) : 0,
    }))
    .sort((a, b) => b.points - a.points);

  const fatalCount = deductions.filter(d => d.points >= 1000).length;

  return {
    totalScore: parsed.totalScore,
    grade: getScoreGrade(parsed.totalScore),
    deductions,
    positives,
    totalNegPoints,
    totalPosPoints,
    fatalCount,
    hasFatal: fatalCount > 0,
    topDeduction: deductions[0] || null,
    raw: message,
  };
}

/**
 * 精简扣分原因文本，去掉冗余前缀
 * "JD写：纯硬件设计，PS/CDR，非AI/技术岗/(20分)" → "纯硬件设计，PS/CDR，非AI/技术岗"
 * "JD写：大小周，明确单休/大小周/(5000分)" → "大小周/单休"
 */
const REASON_SHORTEN_MAP: [RegExp, string][] = [
  [/^JD写[：:]\s*/, ''],
  [/^岗位要求[：:]\s*/, ''],
  [/,明确单休\/大小周/, ''],
  [/明确要求/, ''],
  [/\s*[（(]\s*\/?\s*\d+\s*分\s*[）)]\s*$/, ''],
  [/\/\d+分\s*$/, ''],
];

/** 归并根词提取：去掉尾随的逗号/修饰词，保留核心概念 */
/** 核心概念关键词列表 — 按优先级从高到低匹配 */
const CONCEPT_KEYWORDS: [RegExp, string][] = [
  // === 工作时长/模式 ===
  [/大小周|单休|双休|周末休息|5\.5天|6天制/, '工作时间模式'],
  [/加班|996|007|抗压|高强度|狼性|奋斗/, '工作时间模式'],
  [/弹性|不打卡|朝九晚六|朝十晚七|9.*6.*5/, '工作时间模式'],
  [/居家|远程|现场办公|不接受远程|在线面试/, '工作时间模式'],
  [/夜班|轮班|倒班|晚班/, '工作时间模式'],

  // === 薪资报酬 ===
  [/底薪.*提成|提成.*导向|纯提成|无底薪/, '薪资提成模式'],
  [/薪资面议|低薪|薪资偏低|薪资跨度|薪金/, '薪资偏低/不确定'],
  [/年终奖|13薪|双薪|年底双薪/, '薪资福利-奖金'],
  [/绩效|项目奖金|季度奖|半年奖/, '薪资福利-奖金'],
  [/五险一金/, '五险一金'],
  [/公积金|补充医疗|商业险|年金/, '福利保障'],
  [/期权|股票|股权|分红/, '股权激励'],

  // === 日常福利 ===
  [/餐补|食堂|包吃|餐厅|餐饮|饭补/, '生活福利'],
  [/交通补|房补|班车|住宿|包住|免费宿舍/, '生活福利'],
  [/体检|年假|带薪年假|节日福利|生日|团建|旅游|聚餐|下午茶/, '生活福利'],
  [/通讯补贴|高温补贴|取暖费|凉茶|工装|制服/, '生活福利'],

  // === 学历/经验/技能 ===
  [/学历|大专|本科|研究生|硕士|博士|本科以上|专科/, '学历要求'],
  [/经验.*年|工作经验|年限|3年|2年|1年/, '经验要求不符'],
  [/实习|应届|管培|校招|储备|培训生/, '实习生/应届岗'],
  [/留学|海归|回国|英国|美国|澳洲|加拿大/, '学历要求'],
  [/英语|外语|CET|四级|六级|阿拉伯|德语|日语|俄语|西语|韩语|葡语/, '外语要求'],
  [/驾驶证|驾照|C1|C2|车牌|开车/, '特殊证书要求'],
  [/年龄|岁以下|岁以上|年满/, '年龄限制'],

  // === 岗位类型 ===
  [/底薪.*提成|提成.*导向|销售|电销|陌拜|BD|推销|客户开发|业务拓展|应酬/, '销售类岗位'],
  [/会计|财务|审计|出纳|报税|账务/, '财会类岗位'],
  [/HR|猎头|人力|招聘|HRBP|人事/, '人事类岗位'],
  [/直播|主播|带货|抖音|小红书运营|短视频/, '内容/直播类'],
  [/培训|讲师|教练|教务|辅导|家教|幼教/, '教育类岗位'],
  [/客服|呼叫|热线|电话接听/, '客服类岗位'],
  [/UI|美工|平面|视觉设计|PS|AI|CDR|作品集/, '设计类岗位'],
  [/纯代码|算法|纯开发|编程|前后端|Java|Python.*开发|Go.*开发|C\+\+/, '纯技术开发岗'],
  [/硬件|电子|电路|PCB|EDA|半导体|芯片|CAD|SolidWorks|机械|机器人|自动化|电工/, '硬件/工程类'],
  [/电商|跨境|货代|亚马逊|速卖通|Shopee|海外仓|外贸|阿里巴巴国际站/, '电商/外贸岗'],
  [/助理|专员|文员|秘书|行政|前台/, '行政/助理类'],
  [/运营|社群|新媒体|SEO|SEM|流量/, '运营类岗位'],
  [/客服|售后服务|售后支持/, '客服类岗位'],
  [/品控|质检|检测|审核|合规/, '品控/合规类'],

  // === 行业/领域 ===
  [/传统行业|制造业|工厂|车间|非IT|非互联网/, '传统行业'],
  [/金融|保险|信贷|网贷|P2P|理财/, '金融/保险行业'],
  [/医美|保健品|美容|化妆品|养生/, '医美/保健行业'],
  [/教育|教培|K12|早教/, '教育行业'],
  [/建筑|土木|装修|监理|施工/, '建筑行业'],
  [/外包|派遣|第三方|劳务|驻场人员/, '外包/派遣'],

  // === 工作地点/条件 ===
  [/出差|驻外|外派|外勤|外出拜访|外出/, '出差/外勤'],
  [/通勤|偏远|坪山|大鹏|龙岗.*偏远|光明.*远/, '工作地点偏远'],

  // === 公司风险 ===
  [/押金|担保|培训贷|保证金/, '高风险-押金类'],
  [/小公司|皮包|创业未融资|注册资本/, '高风险-公司规模'],
  [/未融资|天使轮|A轮/, '小公司/融资早期'],
  [/面议|薪资不明确|不公开薪资/, '薪资不透明'],

  // === JD 质量 ===
  [/未提及|模糊|要求不明确|全空话|画饼|空洞/, 'JD质量-含糊'],
  [/岗位名不符|名实脱节|名与职责|职责不符/, 'JD质量-不符'],

  // === 匹配特征：加分 ===
  [/AI工具|AI技术|大模型|LLM|Agent|RAG|Python|智能体|机器学习|深度学习/, '匹配-AI方向'],
  [/项目管理|SOP|PMO|跨部门|协调|会议纪要|进度管理/, '匹配-项目管理'],
  [/活动策划|志愿者|展会|统筹|组织|策划执行/, '匹配-活动统筹'],
  [/API对接|全栈|低代码|ECharts|功能模块|Vibe Coding|前后端/, '匹配-开发能力'],
  [/飞书|日周报|复盘|协作|远程会议|Slack|Trello/, '匹配-协作'],
  [/售前|解决方案|客户成功|交付|实施|POC/, '匹配-售前'],
  [/TOB|SaaS|B端|企业级|客户/, '匹配-B端经验'],
  [/教育|公益|NGO|支教|志愿/, '匹配-公益/教育'],
  [/数据分析|SQL|Excel|Tableau|BI|数据可视化|SPSS|Python.*数据/, '匹配-数据分析'],
  [/通信|电子|计算机|信息工程/, '匹配-专业'],
  [/深圳|宝安|南山|福田|龙华|龙岗|罗湖/, '匹配-位置'],
  [/职责≥3|多个职责|多方面/, '匹配-多维'],
  [/本科|理工|硕士/, '匹配-学历'],
  [/经验不限|无经验|可接受新手/, '匹配-门槛低'],
];

/** 二层映射：提取的根词 → 7 大类 */
const BROAD_MAP: Record<string, string> = {
  '工作时间模式': '1-薪资福利', '工作地点偏远': '1-薪资福利', '出差/外勤': '1-薪资福利',
  '薪资提成模式': '1-薪资福利', '薪资偏低/不确定': '1-薪资福利', '薪资区间匹配': '1-薪资福利',
  '五险一金': '1-薪资福利', '福利保障': '1-薪资福利', '股权激励': '1-薪资福利',
  '生活福利': '1-薪资福利', '薪资福利-奖金': '1-薪资福利',
  '学历要求': '2-经验学历', '经验要求不符': '2-经验学历', '实习生/应届岗': '2-经验学历',
  '外语要求': '2-经验学历', '特殊证书要求': '2-经验学历', '年龄限制': '2-经验学历', '专业不符': '2-经验学历',
  '销售类岗位': '3-岗位类型', '财会类岗位': '3-岗位类型', '人事类岗位': '3-岗位类型',
  '内容/直播类': '3-岗位类型', '教育类岗位': '3-岗位类型', '客服类岗位': '3-岗位类型',
  '设计类岗位': '3-岗位类型', '纯技术开发岗': '3-岗位类型', '硬件/工程类': '3-岗位类型',
  '电商/外贸岗': '3-岗位类型', '行政/助理类': '3-岗位类型', '运营类岗位': '3-岗位类型',
  '品控/合规类': '3-岗位类型', '仓配/物流类': '3-岗位类型',
  '传统行业': '4-行业风险', '金融/保险行业': '4-行业风险', '医美/保健行业': '4-行业风险',
  '外包/派遣': '4-行业风险', '政府/国企': '4-行业风险', '建筑/地产行业': '4-行业风险',
  '高风险-押金类': '4-行业风险', '高风险-公司规模': '4-行业风险', '小公司/融资早期': '4-行业风险',
  'JD质量-含糊': '5-JD质量', 'JD质量-不符': '5-JD质量',
  '匹配-AI方向': '6-匹配特征', '匹配-项目管理': '6-匹配特征', '匹配-活动统筹': '6-匹配特征',
  '匹配-开发能力': '6-匹配特征', '匹配-协作': '6-匹配特征', '匹配-售前': '6-匹配特征',
  '匹配-B端经验': '6-匹配特征', '匹配-办公/数据': '6-匹配特征', '匹配-专业': '6-匹配特征',
  '匹配-位置': '6-匹配特征', '匹配-多维': '6-匹配特征', '匹配-门槛低': '6-匹配特征',
  '匹配-行业': '6-匹配特征',
  '其他': '其他',
};

function extractConceptRoot(reason: string): string {
  let s = simplifyReason(reason);

  // 关键词匹配
  for (const [re, concept] of CONCEPT_KEYWORDS) {
    if (re.test(s)) return BROAD_MAP[concept] || concept;
  }

  return '其他';
}

function simplifyReason(reason: string): string {
  let s = reason;
  for (const [re, replacement] of REASON_SHORTEN_MAP) {
    s = s.replace(re, replacement);
  }
  // 截断超长文本
  if (s.length > 40) s = s.slice(0, 38) + '…';
  return s.trim();
}

// ============================================================
// Quick parse: extract raw deduction lines from message
// ============================================================

/**
 * 提取原始扣分项文本行（用于旧的设计中需要 raw 行的地方）
 */
export function getFirstNegLine(message: string): string | null {
  if (!message) return null;
  const negMatch = message.match(/消极:\n([\s\S]*?)(?=\n积极:|$)/);
  if (!negMatch) return null;
  const lines = negMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0] || null;
}

// ============================================================
// Raw breakdown parsing — 用于「原始评分文本」可视化区
// 解析：JD写：<关键词>，<匹配原因>/(N分)  形式
// 同时兼容无 < > 的旧格式：JD写：关键词，原因/(N分)
// ============================================================

export interface ScoreBreakdownItem {
  /** 触发词 / 命中关键词，例如 "英语好"、"五险一金" */
  keyword: string;
  /** 匹配原因 / 归类标签，例如 "英语读写能力良好"、"福利明确" */
  reason: string;
  /** 分值（绝对值） */
  points: number;
  /** 正负类型 */
  type: 'negative' | 'positive';
}

export interface ScoreBreakdown {
  totalScore: number;
  items: ScoreBreakdownItem[];
  negativeItems: ScoreBreakdownItem[];
  positiveItems: ScoreBreakdownItem[];
  negativeCount: number;
  positiveCount: number;
  /** 是否能成功解析出任何条目 */
  hasItems: boolean;
}

/**
 * 解析单条评分行
 * 兼容：JD写：<关键词>，<匹配原因>/(N分)  /  JD写：关键词，原因/(N分)
 * 兼容：触发词：... /  岗位名为... 等前置标记
 */
function parseScoreBreakdownLine(
  rawLine: string,
  type: 'negative' | 'positive'
): ScoreBreakdownItem | null {
  if (!rawLine) return null;
  const line = rawLine.trim();
  if (!line) return null;

  // 抽取末尾的分值（兼容 /(N分)、(N分)、N分）
  const scoreMatch =
    line.match(/[\/（(]\s*(\d+)\s*分\s*[）)]?\s*$/) ||
    line.match(/(\d+)\s*分\s*$/);
  if (!scoreMatch) return null;
  const points = parseInt(scoreMatch[1], 10);
  if (!points && points !== 0) return null;

  // 去掉前缀（JD写：/ 触发词：/ 岗位名：/ 岗位要求：等）和末尾分值
  let body = line
    .replace(/^(?:JD\s*写|JD写|触发词|岗位名|岗位要求|JD中)[：:]\s*/i, '')
    .replace(/[\/（(]\s*\d+\s*分\s*[）)]?\s*$/, '')
    .replace(/\d+\s*分\s*$/, '')
    .trim();

  if (!body) {
    // 没有正文（极端情况）— 关键词与原因都留空
    return { keyword: '', reason: '', points, type };
  }

  // 优先匹配 <关键词>，<匹配原因>  这种带尖括号的格式
  const bracketMatch = body.match(/^<([^>]+)>\s*[，,，]\s*<([^>]+)>\s*$/);
  if (bracketMatch) {
    return {
      keyword: bracketMatch[1].trim(),
      reason: bracketMatch[2].trim(),
      points,
      type,
    };
  }

  // 兼容单侧尖括号：<关键词>，原因  或  关键词，<原因>
  const mixed1 = body.match(/^<([^>]+)>\s*[，,，]\s*(.+)$/);
  if (mixed1) {
    return {
      keyword: mixed1[1].trim(),
      reason: mixed1[2].trim(),
      points,
      type,
    };
  }
  const mixed2 = body.match(/^(.+?)\s*[，,，]\s*<([^>]+)>\s*$/);
  if (mixed2) {
    return {
      keyword: mixed2[1].trim(),
      reason: mixed2[2].trim(),
      points,
      type,
    };
  }

  // 旧格式：用第一个逗号（或全角逗号）拆分关键词 / 原因
  const parts = body.split(/[，,，]/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      keyword: parts[0],
      reason: parts.slice(1).join('，'),
      points,
      type,
    };
  }

  // 兜底：LLM 没给分类，整段作为关键词；原因留空（由 UI 决定怎么展示）
  return { keyword: body, reason: '', points, type };
}

/**
 * 把原始评分 message 解析为结构化的 {keyword, reason, points, type} 列表
 */
export function parseScoreBreakdown(message: string | undefined | null): ScoreBreakdown | null {
  if (!message || typeof message !== 'string') return null;

  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // 总分
  let totalScore = 0;
  const scoreLine = lines.find(l => l.startsWith('分数'));
  if (scoreLine) {
    const m = scoreLine.match(/分数[：:]?\s*(-?\d+)/);
    if (m) totalScore = parseInt(m[1], 10);
  }

  // 找消极 / 积极分界线
  let negativeStart = -1;
  let positiveStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('消极') || l.includes('扣分')) negativeStart = i;
    if (l.includes('积极') || l.includes('加分')) positiveStart = i;
  }

  const negativeItems: ScoreBreakdownItem[] = [];
  const positiveItems: ScoreBreakdownItem[] = [];

  // 消极段
  if (negativeStart >= 0) {
    const endIdx = positiveStart >= 0 ? positiveStart : lines.length;
    for (let i = negativeStart + 1; i < endIdx; i++) {
      const item = parseScoreBreakdownLine(lines[i], 'negative');
      if (item) negativeItems.push(item);
    }
  }

  // 积极段
  if (positiveStart >= 0) {
    for (let i = positiveStart + 1; i < lines.length; i++) {
      const item = parseScoreBreakdownLine(lines[i], 'positive');
      if (item) positiveItems.push(item);
    }
  }

  const items: ScoreBreakdownItem[] = [...negativeItems, ...positiveItems];

  return {
    totalScore,
    items,
    negativeItems,
    positiveItems,
    negativeCount: negativeItems.length,
    positiveCount: positiveItems.length,
    hasItems: items.length > 0,
  };
}

// ============================================================
// Bulk analysis from raw AI scoring logs
// 以 AI 评分日志为源头（而不是 pipeline 记录）做完整分析
// ============================================================

export interface BulkAnalysisResult {
  /** 总 AI 评分日志数 */
  totalScoringLogs: number;
  /** 含有效分数（消极或积极）的日志数 */
  withScoreLogs: number;
  /** 含具体扣分项的日志数 */
  withDeductions: number;
  /** 含具体加分项的日志数 */
  withPositives: number;
  /** 所有扣分项的聚合 */
  deductions: ArrayCategory;
  /** 所有加分项的聚合 */
  positives: ArrayCategory;
}

export interface ArrayCategory {
  items: Array<{
    reason: string;
    score: number;      // 平均分
    count: number;
    totalScore: number; // 总分
    jobIds: string[];
    variants: string[];
  }>;
  totalItems: number;
  uniqueReasons: number;
}

import type { AiScoringLog } from '@/types';

/** 从 AI 评分日志数组中聚合所有扣分/加分项 */
export function analyzeAllScoringLogs(logs: AiScoringLog[]): BulkAnalysisResult {
  const negMap = new Map<string, { score: number; count: number; jobIds: string[] }>();
  const posMap = new Map<string, { score: number; count: number; jobIds: string[] }>();

  let withScoreLogs = 0;
  let withDeductions = 0;
  let withPositives = 0;

  for (const log of logs) {
    if (!log.message || !log.message.includes('分数')) continue;
    withScoreLogs++;

    // 扣分项
    const negMatch = log.message.match(/消极:\n([\s\S]*?)(?=\n积极:|$)/);
    if (negMatch) {
      const lines = negMatch[1].split('\n').filter(Boolean);
      let hasNegative = false;
      for (const line of lines) {
        const m = line.match(/^(.+?)\s*[（(]\s*\/?\s*(\d+)\s*分\s*[）)]\s*$/);
        const m2 = line.match(/^(.+?)\/(\d+)分$/);
        let reason = '';
        let score = 0;
        if (m) { reason = m[1].trim(); score = parseInt(m[2], 10); }
        else if (m2) { reason = m2[1].trim(); score = parseInt(m2[2], 10); }
        if (!reason || !score) continue;

        hasNegative = true;
        const clean = simplifyReason(reason);
        if (!negMap.has(clean)) {
          negMap.set(clean, { score: 0, count: 0, jobIds: [] });
        }
        const entry = negMap.get(clean)!;
        entry.score = score;
        entry.count++;
        if (log.encryptJobId && !entry.jobIds.includes(log.encryptJobId)) entry.jobIds.push(log.encryptJobId);
      }
      if (hasNegative) withDeductions++;
    }

    // 加分项
    const posMatch = log.message.match(/积极:\n([\s\S]*)$/);
    if (posMatch) {
      const lines = posMatch[1].split('\n').filter(Boolean);
      let hasPositive = false;
      for (const line of lines) {
        const m = line.match(/^(.+?)\s*[（(]\s*\/?\s*(\d+)\s*分\s*[）)]\s*$/);
        const m2 = line.match(/^(.+?)\/(\d+)分$/);
        let reason = '';
        let score = 0;
        if (m) { reason = m[1].trim(); score = parseInt(m[2], 10); }
        else if (m2) { reason = m2[1].trim(); score = parseInt(m2[2], 10); }
        if (!reason || !score) continue;

        hasPositive = true;
        const clean = simplifyReason(reason);
        if (!posMap.has(clean)) {
          posMap.set(clean, { score: 0, count: 0, jobIds: [] });
        }
        const entry = posMap.get(clean)!;
        entry.score = score;
        entry.count++;
        if (log.encryptJobId && !entry.jobIds.includes(log.encryptJobId)) entry.jobIds.push(log.encryptJobId);
      }
      if (hasPositive) withPositives++;
    }
  }

  const buildCategory = (map: Map<string, { score: number; count: number; jobIds: string[] }>): ArrayCategory => {
    let totalItems = 0;

    // 按 root 分组（不按分值），合并同义词后计算平均分
    const groups = new Map<string, {
      reasons: string[];
      totalCount: number;
      totalScore: number;
      jobIds: string[];
    }>();

    for (const [reason, data] of Array.from(map.entries())) {
      const root = extractConceptRoot(reason) || '其他';
      if (!groups.has(root)) {
        groups.set(root, { reasons: [], totalCount: 0, totalScore: 0, jobIds: [] });
      }
      const g = groups.get(root)!;
      g.reasons.push(reason);
      g.totalCount += data.count;
      g.totalScore += data.count * data.score;
      for (const id of data.jobIds) {
        if (!g.jobIds.includes(id)) g.jobIds.push(id);
      }
    }

    // 构建输出：平均分 = totalScore / totalCount
    const rows = Array.from(groups.entries())
      .map(([, g]) => {
        totalItems += g.totalCount;
        const avgScore = g.totalCount > 0 ? Math.round(g.totalScore / g.totalCount) : 0;
        const bestReason = g.reasons.sort((a, b) => {
          const ca = map.get(a)?.count || 0;
          const cb = map.get(b)?.count || 0;
          return cb - ca;
        })[0];
        return {
          reason: bestReason,
          score: avgScore,
          count: g.totalCount,
          totalScore: g.totalScore,
          jobIds: g.jobIds,
          variants: g.reasons.length > 1 ? g.reasons.map(r => `${r} (×${map.get(r)?.count || 0})`) : [],
        };
      })
      .sort((a, b) => b.count - a.count);

    return { items: rows, totalItems, uniqueReasons: rows.length };
  };

  return {
    totalScoringLogs: logs.length,
    withScoreLogs,
    withDeductions,
    withPositives,
    deductions: buildCategory(negMap),
    positives: buildCategory(posMap),
  };
}

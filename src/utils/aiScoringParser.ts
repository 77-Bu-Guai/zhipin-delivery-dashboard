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

import { FATAL_DEDUCTION_THRESHOLD } from './scoringConstants';

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
 * 扣分项按分值降序，致命项（幅度 ≥ FATAL_DEDUCTION_THRESHOLD 分，见 scoringConstants）高亮
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

  const fatalCount = deductions.filter(d => d.points >= FATAL_DEDUCTION_THRESHOLD).length;

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
    line.match(/[/（(]\s*(\d+)\s*分\s*[）)]?\s*$/) ||
    line.match(/(\d+)\s*分\s*$/);
  if (!scoreMatch) return null;
  const points = parseInt(scoreMatch[1], 10);
  if (!points && points !== 0) return null;

  // 去掉前缀（JD写：/ 触发词：/ 岗位名：/ 岗位要求：等）和末尾分值
  const body = line
    .replace(/^(?:JD\s*写|JD写|触发词|岗位名|岗位要求|JD中)[：:]\s*/i, '')
    .replace(/[/（(]\s*\d+\s*分\s*[）)]?\s*$/, '')
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

export interface FactorCategories {
  version: number;
  generatedAt: string;
  negativeCategories: { name: string; color: string; desc: string }[];
  positiveCategories: { name: string; color: string; desc: string }[];
  negativeMap: Record<string, string>;
  positiveMap: Record<string, string>;
}

/** 异步加载 public/factor-categories.json */
export async function loadFactorCategories(): Promise<FactorCategories | null> {
  try {
    const res = await fetch('/factor-categories.json');
    if (!res.ok) return null;
    return (await res.json()) as FactorCategories;
  } catch {
    return null;
  }
}

/** 从 AI 评分日志数组中聚合所有扣分/加分项
 *  传入 factorMaps 时按 MiMo 20 大类聚合；否则回退到原始因素文本聚合 */
export function analyzeAllScoringLogs(
  logs: AiScoringLog[],
  factorMaps?: { negative: Record<string, string>; positive: Record<string, string> } | null,
): BulkAnalysisResult {
  // key -> { score: 最后一次分值, count, jobIds, totalScore }
  const negMap = new Map<string, { score: number; count: number; jobIds: string[]; totalScore: number }>();
  const posMap = new Map<string, { score: number; count: number; jobIds: string[]; totalScore: number }>();

  let withScoreLogs = 0;
  let withDeductions = 0;
  let withPositives = 0;

  function ingest(
    map: Map<string, { score: number; count: number; jobIds: string[]; totalScore: number }>,
    rawLine: string,
    type: 'negative' | 'positive',
    jobId: string,
  ) {
    const m = rawLine.match(/^(.+?)\s*[（(]\s*\/?\s*(\d+)\s*分\s*[）)]\s*$/);
    const m2 = rawLine.match(/^(.+?)\/(\d+)分$/);
    let reason = '';
    let score = 0;
    if (m) { reason = m[1].trim(); score = parseInt(m[2], 10); }
    else if (m2) { reason = m2[1].trim(); score = parseInt(m2[2], 10); }
    if (!reason || !score) return null;

    // 用 factor map 把原始因素映射到 20 大类；未命中则保留简化后的原始文本
    const clean = simplifyReason(reason);
    const key = factorMaps
      ? (factorMaps[type][rawLine.trim()] || factorMaps[type][clean] || clean)
      : clean;

    if (!map.has(key)) {
      map.set(key, { score: 0, count: 0, jobIds: [], totalScore: 0 });
    }
    const entry = map.get(key)!;
    entry.score = score;
    entry.count++;
    entry.totalScore += score;
    if (jobId && !entry.jobIds.includes(jobId)) entry.jobIds.push(jobId);
    return key;
  }

  for (const log of logs) {
    if (!log.message || !log.message.includes('分数')) continue;
    withScoreLogs++;

    // 扣分项
    const negMatch = log.message.match(/消极[:：]\n([\s\S]*?)(?=\n积极[:：]|$)/);
    if (negMatch) {
      const lines = negMatch[1].split('\n').filter(Boolean);
      let hasNegative = false;
      for (const line of lines) {
        if (ingest(negMap, line, 'negative', log.encryptJobId)) hasNegative = true;
      }
      if (hasNegative) withDeductions++;
    }

    // 加分项
    const posMatch = log.message.match(/积极[:：]\n([\s\S]*)$/);
    if (posMatch) {
      const lines = posMatch[1].split('\n').filter(Boolean);
      let hasPositive = false;
      for (const line of lines) {
        if (ingest(posMap, line, 'positive', log.encryptJobId)) hasPositive = true;
      }
      if (hasPositive) withPositives++;
    }
  }

  const buildCategory = (
    map: Map<string, { score: number; count: number; jobIds: string[]; totalScore: number }>,
  ): ArrayCategory => {
    let totalItems = 0;
    const rows = Array.from(map.entries())
      .map(([reason, data]) => {
        totalItems += data.count;
        const avgScore = data.count > 0 ? Math.round(data.totalScore / data.count) : 0;
        return {
          reason,
          score: avgScore,
          count: data.count,
          totalScore: data.totalScore,
          jobIds: data.jobIds,
          variants: [], // AI 分类后不再展开同义词变体
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

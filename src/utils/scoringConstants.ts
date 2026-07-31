/**
 * 评分阈值 —— 单一事实来源（Single Source of Truth）
 *
 * 为什么集中在这里：
 *   原代码把「致命阈值 1000」作为魔法数字散落在 aiScoringParser.ts 与 dataLoader.ts 的多处
 *   （解析逻辑、分档函数、UI label 注释），需求或提示词一旦变动极易漏改，正是 BUG-003 的根因。
 *
 * 致命项定义：单条扣分的「幅度（绝对值）」≥ FATAL_DEDUCTION_THRESHOLD 即视为「致命扣分」。
 *   对应 AI 评分提示词（scripts/ai-scoring-prompt-v4.md）中的两类硬排除信号：
 *     - 致命否决：命中任一条 → 该条扣分幅度为 9999（总分返回 -9999，停止评分，见 prompt 第 16/180 行）
 *     - 红线硬排除：固定 -1000（不可触碰的红线分值，AIChat 提示词第 437/501 行明确锁定原值）
 *   两者幅度均 ≥ 1000，故阈值取 1000 可同时覆盖，无需为 -9999 单独判断。
 *
 * 📌 跨版本迭代的分值差异属正常现象（产品确认原则）：
 *   评分提示词持续迭代，不同版本出现过 -9999（致命否决）、-1000（红线）、-5000（旧版需求命名）等不同幅度，
 *   这是版本演进的历史痕迹，并非 bug；只要「同一时间段 / 同一批次数据」内解析口径一致即可。
 *   本项目仅做解析：阈值保持 1000 是 -1000 红线的超集，可稳定覆盖 -9999/-5000/-1000 等所有致命信号，无需为某版本单独调值。
 *   ⚠️ 若要把提示词里的「红线指令值」从 -1000 改为其他值，须同步修改 AI 评分提示词（见下方 AI_RED_LINE_DEDUCTION 说明）。
 */
export const FATAL_DEDUCTION_THRESHOLD = 1000;

/**
 * AI 评分提示词中的「硬性排除红线」指令值（负值，AI 输出的扣分项分值）。
 * 与上方 FATAL_DEDUCTION_THRESHOLD(=1000, 解析识别阈值) 是配对关系：
 *   - AI_RED_LINE_DEDUCTION = -1000 → 写在给 AI 的系统提示词里，要求模型命中绝对不可接受岗位时打 -1000
 *   - FATAL_DEDUCTION_THRESHOLD = 1000 → 解析层用「幅度绝对值 ≥ 1000」识别致命项，是 -1000 的超集
 * AIChat.tsx 的提示词模板必须引用本常量，而非写死字面量，否则两端会漂移（违反「同一套内一致」原则）。
 */
export const AI_RED_LINE_DEDUCTION = -1000;

/**
 * 扣分项分档阈值（幅度降序边界）。
 * 致命 ≥ FATAL / 重要 ≥300 / 普通 ≥100 / 轻微 ≥50 / 微不足道 <50。
 */
export const TIER_THRESHOLDS = {
  fatal: FATAL_DEDUCTION_THRESHOLD,
  major: 300,
  minor: 100,
  minorMinus: 50,
} as const;

export const TIER_LABELS: Record<'fatal' | 'major' | 'minor' | 'minor-minus' | 'trivial', string> = {
  fatal: `致命扣分 (≥${FATAL_DEDUCTION_THRESHOLD}分)`,
  major: '重要扣分 (300-999分)',
  minor: '普通扣分 (100-299分)',
  'minor-minus': '轻微扣分 (50-99分)',
  trivial: '微不足道 (<50分)',
};

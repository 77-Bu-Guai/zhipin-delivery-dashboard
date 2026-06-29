/**
 * AI 评分文本解析器
 *
 * 输入示例：
 *   分数-920
 *   消极（扣分）：
 *   明确要求英语可作为工作语言（/500分）
 *   要求小语种（泰语/越南语），属于外语岗位范畴（/500分）
 *   积极（加分）：
 *   岗位涉及 AI/大模型/智能体相关业务（/10分）
 *   岗位职责包含用户运营、内容运营、活动策划等，符合产品运营/项目统筹方向（/50分）
 *   明确写五险一金（/10分）
 *   福利包含零食下午茶、团建聚餐（/10分）
 */

export interface AiScoreItem {
  reason: string;
  points: number; // 正数 = 加分，负数 = 扣分
}

export interface ParsedAiScore {
  totalScore: number;
  negativeItems: AiScoreItem[];
  positiveItems: AiScoreItem[];
  raw: string;
}

/**
 * 从原始评分文本解析出结构化数据
 */
export function parseAiScoreMessage(message: string): ParsedAiScore | null {
  if (!message || typeof message !== 'string') return null;

  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // 解析总分：分数-920 或 分数: -920 或 分数 920
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
    if (line.includes('消极') || line.includes('扣分')) {
      negativeStart = i;
    }
    if (line.includes('积极') || line.includes('加分')) {
      positiveStart = i;
    }
  }

  // 提取消极项（用负分数）
  const negativeItems: AiScoreItem[] = [];
  if (negativeStart >= 0) {
    const endIdx = positiveStart >= 0 ? positiveStart : lines.length;
    for (let i = negativeStart + 1; i < endIdx; i++) {
      const item = parseAbsoluteScoreLine(lines[i]);
      if (item) negativeItems.push({ reason: item.reason, points: -item.points });
    }
  }

  // 提取积极项（用正分数）
  const positiveItems: AiScoreItem[] = [];
  if (positiveStart >= 0) {
    for (let i = positiveStart + 1; i < lines.length; i++) {
      const item = parseAbsoluteScoreLine(lines[i]);
      if (item) positiveItems.push({ reason: item.reason, points: item.points });
    }
  }

  return {
    totalScore,
    negativeItems,
    positiveItems,
    raw: message,
  };
}

/**
 * 解析单行评分项，返回绝对值
 * "明确要求英语可作为工作语言（/500分）" -> { reason: "...", points: 500 }
 * "福利包含零食下午茶、团建聚餐（/10分）" -> { reason: "...", points: 10 }
 */
function parseAbsoluteScoreLine(line: string): { reason: string; points: number } | null {
  if (!line) return null;

  // 匹配格式：文本（/N分）或 文本（N分）或 文本/N分
  const match = line.match(/^(.+?)（\s*\/?\s*(-?\d+)\s*分\s*）$/);
  if (match) {
    const reason = match[1].trim();
    const points = Math.abs(parseInt(match[2], 10));
    return { reason, points };
  }

  return null;
}

/**
 * 获取评分等级
 */
export function getScoreGrade(score: number): { label: string; color: string; bg: string } {
  if (score >= 100) return { label: 'S - 极优', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (score >= 50) return { label: 'A - 优秀', color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
  if (score >= 0) return { label: 'B - 良好', color: 'text-blue-400', bg: 'bg-blue-500/10' };
  if (score >= -100) return { label: 'C - 一般', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  if (score >= -500) return { label: 'D - 较差', color: 'text-orange-400', bg: 'bg-orange-500/10' };
  return { label: 'F - 很差', color: 'text-red-400', bg: 'bg-red-500/10' };
}

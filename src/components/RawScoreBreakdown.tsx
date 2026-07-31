/**
 * RawScoreBreakdown — 评分明细可视化
 *
 * 把原始 message（如 "分数240\n消极:...积极:..."）解析成结构化的卡片列表
 * 关键词 <keyword> 与匹配原因 <reason> 分别用 Badge 高亮
 * 设计原则：
 *   · 顶部一行展示「投递状态 + 总分 + 等级徽章」，一眼看到结论
 *   · 消极/积极 各自成段，颜色严格区分（红 / 绿）
 *   · 每条评分：JD写：[关键词Badge]，[原因Badge]   ……   -N/+N
 *   · 关键词更深（实色填充），原因更浅（描边），建立视觉层级
 */

import { Check, X } from 'lucide-react';
import { parseScoreBreakdown, getScoreGrade, type ScoreBreakdownItem } from '@/utils/aiScoringParser';

interface RawScoreBreakdownProps {
  message: string | undefined | null;
}

export default function RawScoreBreakdown({ message }: RawScoreBreakdownProps) {
  const data = parseScoreBreakdown(message);
  if (!data) {
    return (
      <div className="text-xs text-warm-400 italic px-2 py-3">
        暂无评分明细
      </div>
    );
  }

  const { totalScore, negativeItems, positiveItems, negativeCount, positiveCount, hasItems } = data;
  const grade = getScoreGrade(totalScore);
  const isPositive = totalScore >= 0;

  if (!hasItems) {
    return (
      <div className="text-xs text-warm-400 italic px-2 py-3">
        暂无评分明细
      </div>
    );
  }

  return (
    <div className="space-y-4 select-text">
      {/* ── 顶部：投递状态 + 总分 + 等级徽章 ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-warm-50 rounded-xl border border-warm-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${grade.bgClass} ${grade.textClass} border ${grade.borderClass} flex-shrink-0`}>
            <span className="font-display text-base leading-none">{grade.label}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-warm-500 leading-tight">投递状态 · 综合评分</p>
            <p className="text-xs text-warm-400 leading-tight mt-0.5">
              消极 {negativeCount} 项 · 积极 {positiveCount} 项
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`font-display text-2xl tracking-tight tabular-nums leading-none ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{totalScore}
          </div>
          <p className="text-2xs text-warm-400 mt-0.5">{grade.label} 级匹配</p>
        </div>
      </div>

      {/* ── 消极（扣分）── */}
      {negativeItems.length > 0 && (
        <Section
          type="negative"
          icon={<X className="w-3.5 h-3.5" strokeWidth={2.5} />}
          label="消极"
          count={negativeCount}
          totalPoints={negativeItems.reduce((s, i) => s + i.points, 0)}
        >
          {negativeItems.map((item, i) => (
            <BreakdownRow key={`n-${i}`} item={item} />
          ))}
        </Section>
      )}

      {/* ── 积极（加分）── */}
      {positiveItems.length > 0 && (
        <Section
          type="positive"
          icon={<Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
          label="积极"
          count={positiveCount}
          totalPoints={positiveItems.reduce((s, i) => s + i.points, 0)}
        >
          {positiveItems.map((item, i) => (
            <BreakdownRow key={`p-${i}`} item={item} />
          ))}
        </Section>
      )}
    </div>
  );
}

// ============================================================
// Section — 消极 / 积极 分段容器
// ============================================================

interface SectionProps {
  type: 'negative' | 'positive';
  icon: React.ReactNode;
  label: string;
  count: number;
  totalPoints: number;
  children: React.ReactNode;
}

function Section({ type, icon, label, count, totalPoints, children }: SectionProps) {
  const isNeg = type === 'negative';
  const accentText = isNeg ? 'text-red-600' : 'text-emerald-600';
  const accentBg = isNeg ? 'bg-red-50' : 'bg-emerald-50';
  const accentBorder = isNeg ? 'border-red-200' : 'border-emerald-200';
  const scoreText = isNeg ? 'text-red-600' : 'text-emerald-600';
  const sign = isNeg ? '-' : '+';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${accentBg} ${accentText}`}>
          {icon}
        </span>
        <span className={`text-sm font-semibold ${accentText}`}>{label}</span>
        <span className="text-xs text-warm-400">{count} 项</span>
        <span className="ml-auto text-xs">
          <span className={`font-bold tabular-nums ${scoreText}`}>{sign}{totalPoints}</span>
          <span className="text-warm-400 ml-1">分</span>
        </span>
      </div>
      <div className={`rounded-xl border ${accentBorder} ${accentBg}/40 divide-y divide-warm-100 overflow-hidden`}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// BreakdownRow — 单条评分行
// ============================================================

function BreakdownRow({ item }: { item: ScoreBreakdownItem }) {
  const isNeg = item.type === 'negative';
  const sign = isNeg ? '-' : '+';

  // 消极：关键词深红填充 + 原因浅红描边
  // 积极：关键词深绿填充 + 原因浅绿描边
  const kwBg = isNeg ? 'bg-red-100' : 'bg-emerald-100';
  const kwText = isNeg ? 'text-red-700' : 'text-emerald-700';
  const kwBorder = isNeg ? 'border-red-300' : 'border-emerald-300';

  const reasonBg = isNeg ? 'bg-amber-50' : 'bg-amber-50';
  const reasonText = isNeg ? 'text-amber-700' : 'text-amber-700';
  const reasonBorder = isNeg ? 'border-amber-200' : 'border-amber-200';

  const scoreColor = isNeg ? 'text-red-600' : 'text-emerald-600';

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 bg-white hover:bg-warm-50 transition-colors">
      {/* JD写前缀 */}
      <span className="text-2xs text-warm-400 flex-shrink-0 tabular-nums">JD写：</span>

      {/* 关键词 Badge（实色填充，更显眼） */}
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${kwBg} ${kwText} ${kwBorder} flex-shrink-0 max-w-[40%] truncate`}
            title={item.keyword}>
        {item.keyword}
      </span>

      {/* 分隔符 */}
      <span className="text-warm-300 flex-shrink-0">，</span>

      {/* 匹配原因 Badge（浅描边，更克制） */}
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${reasonBg} ${reasonText} ${reasonBorder} flex-shrink-0 max-w-[40%] truncate`}
            title={item.reason}>
        {item.reason}
      </span>

      {/* 分值（右对齐，吸睛） */}
      <span className={`ml-auto text-xs font-bold tabular-nums flex-shrink-0 ${scoreColor}`}>
        {sign}{item.points}
      </span>
    </div>
  );
}
/**
 * FilterReasonColumn — 表格里的「筛选原因」三段式拆分
 *
 * 设计：把原来一个单元格内的三段拆成三个独立组件
 *   · <ScoreBar>      → AI评分（等级徽章 + 总分）
 *   · <NegativeList>  → 消极（扣分列表）
 *   · <PositiveChips> → 积极（加分 chip）
 *
 * 配合表格使用：把三个组件分别塞进三个独立 <td>，列头与之一一对应
 *
 * 通用：
 *   · 最多展示 top 4 项，多余用 "+N 更多" 收口
 *   · LLM 没给分类时，keyword 作为主体、reason 留空（不显示破折号）
 *   · 无 AI 评分数据时由各组件自己处理（fallback）
 */

import { Check, X } from 'lucide-react';
import {
  parseScoreBreakdown,
  type ScoreBreakdownItem,
} from '@/utils/aiScoringParser';

// ============================================================
// 共用：解析数据 + 失败兜底
// ============================================================

interface ParsedData {
  totalScore: number;
  negativeItems: ScoreBreakdownItem[];
  positiveItems: ScoreBreakdownItem[];
}

function useParsedData(message: string | undefined | null): ParsedData | null {
  const data = parseScoreBreakdown(message);
  if (!data || !data.hasItems) return null;
  return {
    totalScore: data.totalScore,
    negativeItems: data.negativeItems,
    positiveItems: data.positiveItems,
  };
}

// ============================================================
// <ScoreBar> — AI评分（等级 + 总分）
// ============================================================

interface ScoreBarProps {
  message: string | undefined | null;
  fallback?: string;
}

export function ScoreBar({ message, fallback }: ScoreBarProps) {
  const data = useParsedData(message);
  if (!data) {
    return fallback ? (
      <span className="text-xs text-warm-600 leading-relaxed">{fallback}</span>
    ) : (
      <span className="text-xs text-warm-400 italic">—</span>
    );
  }
  const isPos = data.totalScore >= 0;
  return (
    <div className="flex items-center min-w-0">
      <span
        className={`font-display text-sm tabular-nums font-semibold leading-none flex-shrink-0 ${
          isPos ? 'text-emerald-600' : 'text-red-600'
        }`}
        title="AI 评分"
      >
        {isPos ? '+' : ''}
        {data.totalScore}
      </span>
    </div>
  );
}

// ============================================================
// <NegativeList> — 消极（扣分列表）
// ============================================================

interface NegativeListProps {
  message: string | undefined | null;
  maxItems?: number;
}

export function NegativeList({ message, maxItems = 100 }: NegativeListProps) {
  const data = useParsedData(message);
  if (!data) {
    return <span className="text-xs text-warm-400 italic">—</span>;
  }
  const items = data.negativeItems;
  if (items.length === 0) {
    return <span className="text-xs text-warm-400 italic">无</span>;
  }
  const total = items.reduce((s, i) => s + i.points, 0);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 px-1 pb-0.5 border-b border-warm-100">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-red-100 text-red-600">
          <X className="w-2 h-2" strokeWidth={3} />
        </span>
        <span className="text-sm font-semibold text-red-600">消极</span>
        <span className="text-xs text-warm-400">·{items.length}项</span>
        <span className="ml-auto text-xs text-red-600 tabular-nums font-semibold">
          -{total}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 pt-0.5 min-w-0">
        {items.slice(0, maxItems).map((item, i) => {
          const label = item.keyword || item.reason;
          const tip = item.keyword && item.reason
            ? `${item.keyword} · ${item.reason}`
            : label;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-sm text-red-700 tabular-nums"
              title={tip}
            >
              <span className="truncate max-w-[220px]">{label}</span>
              <b className="font-semibold flex-shrink-0">-{item.points}</b>
            </span>
          );
        })}
        {items.length > maxItems && (
          <span className="text-xs text-warm-400 self-center italic">
            +{items.length - maxItems}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// <PositiveChips> — 积极（加分 chip）
// ============================================================

interface PositiveChipsProps {
  message: string | undefined | null;
  maxItems?: number;
}

export function PositiveChips({ message, maxItems = 100 }: PositiveChipsProps) {
  const data = useParsedData(message);
  if (!data) {
    return <span className="text-xs text-warm-400 italic">—</span>;
  }
  const items = data.positiveItems;
  if (items.length === 0) {
    return <span className="text-xs text-warm-400 italic">无</span>;
  }
  const total = items.reduce((s, i) => s + i.points, 0);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 px-1 pb-0.5 border-b border-warm-100">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-emerald-100 text-emerald-600">
          <Check className="w-2 h-2" strokeWidth={3} />
        </span>
        <span className="text-sm font-semibold text-emerald-600">积极</span>
        <span className="text-xs text-warm-400">·{items.length}项</span>
        <span className="ml-auto text-xs text-emerald-600 tabular-nums font-semibold">
          +{total}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 pt-0.5 min-w-0">
        {items.slice(0, maxItems).map((item, i) => {
          const label = item.keyword || item.reason;
          const tip = item.keyword && item.reason
            ? `${item.keyword} · ${item.reason}`
            : label;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 tabular-nums"
              title={tip}
            >
              <span className="truncate max-w-[220px]">{label}</span>
              <b className="font-semibold flex-shrink-0">+{item.points}</b>
            </span>
          );
        })}
        {items.length > maxItems && (
          <span className="text-xs text-warm-400 self-center italic">
            +{items.length - maxItems}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 兼容旧 API：保留默认导出（垂直堆叠版），用于非表格场景
// ============================================================

interface FilterReasonColumnProps {
  message: string | undefined | null;
  fallback?: string;
  maxItems?: number;
}

export default function FilterReasonColumn({
  message,
  fallback,
  maxItems = 100,
}: FilterReasonColumnProps) {
  const data = useParsedData(message);
  if (!data) {
    return fallback ? (
      <span className="text-xs text-warm-600 leading-relaxed">{fallback}</span>
    ) : (
      <span className="text-xs text-warm-400 italic">—</span>
    );
  }
  return (
    <div className="space-y-1.5">
      <ScoreBar message={message} fallback={fallback} />
      {data.negativeItems.length > 0 && (
        <NegativeList message={message} maxItems={maxItems} />
      )}
      {data.positiveItems.length > 0 && (
        <PositiveChips message={message} maxItems={maxItems} />
      )}
    </div>
  );
}
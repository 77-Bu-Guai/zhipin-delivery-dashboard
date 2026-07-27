import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { analyzeAllScoringLogs } from '@/utils/aiScoringParser';
import { Lightbulb, TrendingDown, TrendingUp, ChevronDown, ChevronRight, Target, AlertTriangle, Zap, Copy, Check } from 'lucide-react';

export default function PromptOptimizationPage() {
  const { rawAiScoringLogs, getFilteredLogs } = useAppStore();
  const logs = getFilteredLogs();
  const [showMerge, setShowMerge] = useState(true);
  const [showGaps, setShowGaps] = useState(true);
  const [copied, setCopied] = useState(false);

  // 以 AI 评分日志为源头做分析
  const bulk = useMemo(() => analyzeAllScoringLogs(rawAiScoringLogs), [rawAiScoringLogs]);

  // 扣分项归并建议：同一概念被 AI 用多种措辞表达
  // 注意：bulk.deductions.items 已经被 extractConceptRoot 预分组，variants 数组包含所有变体
  const mergeCandidates = useMemo(() => {
    return bulk.deductions.items
      .filter(item => item.variants && item.variants.length >= 2)
      .map(item => ({
        root: item.reason,
        variants: item.variants,
        count: item.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [bulk]);

  // 加分项归并建议
  const posMergeCandidates = useMemo(() => {
    return bulk.positives.items
      .filter(item => item.variants && item.variants.length >= 2)
      .map(item => ({
        root: item.reason,
        variants: item.variants,
        count: item.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [bulk]);

  // 低触发率项：在所有日志中出现次数少于 5
  const lowTriggerNeg = useMemo(() =>
    bulk.deductions.items.filter(i => i.count < 5).slice(0, 15),
  [bulk]);

  const lowTriggerPos = useMemo(() =>
    bulk.positives.items.filter(i => i.count < 5).slice(0, 15),
  [bulk]);

  // 生成 AI 可读的分析摘要
  const generateAISummary = () => {
    const lines = [
      '# 提示词优化分析',
      '',
      `## 数据概况`,
      `- AI 评分日志: ${bulk.totalScoringLogs} 条`,
      `- 含扣分项: ${bulk.withDeductions} 条`,
      `- 含加分项: ${bulk.withPositives} 条`,
      `- 扣分关键词种类: ${bulk.deductions.uniqueReasons}`,
      `- 加分关键词种类: ${bulk.positives.uniqueReasons}`,
      '',
      `## 需归并的扣分规则（AI 用不同措辞表达同一概念）`,
      ...mergeCandidates.slice(0, 10).map(m =>
        `- "${m.root}": ${m.variants.slice(0, 5).map(v => `"${v}"`).join(', ')}${m.variants.length > 5 ? ` 等 ${m.variants.length} 种` : ''}`
      ),
      '',
      `## 需归并的加分规则`,
      ...posMergeCandidates.slice(0, 10).map(m =>
        `- "${m.root}": ${m.variants.slice(0, 5).map(v => `"${v}"`).join(', ')}${m.variants.length > 5 ? ` 等 ${m.variants.length} 种` : ''}`
      ),
      '',
      `## 低触发率扣分项（<5次，可能未充分覆盖JD关键词）`,
      ...lowTriggerNeg.slice(0, 10).map(i => `- "${i.reason}" 触发 ${i.count} 次`),
      '',
      `## 低触发率加分项`,
      ...lowTriggerPos.slice(0, 10).map(i => `- "${i.reason}" 触发 ${i.count} 次`),
      '',
      `## Top 10 扣分关键词（高频项，检查是否有冗余规则）`,
      ...bulk.deductions.items.slice(0, 10).map((i, idx) =>
        `- #${idx + 1} "${i.reason}" ${i.count} 次 (均 ${i.score} 分)`
      ),
      '',
      `## Top 10 加分关键词`,
      ...bulk.positives.items.slice(0, 10).map((i, idx) =>
        `- #${idx + 1} "${i.reason}" ${i.count} 次 (均 ${i.score} 分)`
      ),
    ];
    return lines.join('\n');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generateAISummary());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (rawAiScoringLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center">
          <Lightbulb className="w-7 h-7 text-warm-400" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-warm-500">暂无 AI 评分数据</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in">
      {/* 标题 + 复制按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-amber-500" strokeWidth={2} />
          <h2 className="font-display text-3xl tracking-tight text-warm-900">提示词优化分析</h2>
          <span className="badge badge--success text-2xs">AI 可读</span>
        </div>
        <button
          onClick={handleCopy}
          className="btn btn--secondary btn--sm"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制为 AI 可读格式'}
        </button>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="card p-5 space-y-1">
          <p className="stat-label">AI 评分日志</p>
          <p className="stat-number">{bulk.totalScoringLogs}</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-red-400">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-red-500" />
            <p className="stat-label text-red-600">含扣分项</p>
          </div>
          <p className="stat-number text-red-600">{bulk.withDeductions}</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-emerald-400">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <p className="stat-label text-emerald-600">含加分项</p>
          </div>
          <p className="stat-number text-emerald-600">{bulk.withPositives}</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-accent-400">
          <p className="stat-label text-accent-600">需归并的扣分规则</p>
          <p className="stat-number text-accent-500">{mergeCandidates.length}</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-amber-400">
          <p className="stat-label text-amber-600">低触发规则</p>
          <p className="stat-number text-amber-600">{lowTriggerNeg.length + lowTriggerPos.length}</p>
        </div>
      </div>

      {/* ===== 扣分项归并建议 ===== */}
      <CollapsibleSection
        title="扣分项归并建议"
        subtitle="AI 用不同措辞表达了同一个概念 → 建议在提示词中统一为一个短语"
        icon={<Zap className="w-4 h-4 text-amber-500" />}
        show={showMerge}
        onToggle={() => setShowMerge(!showMerge)}
        count={mergeCandidates.length}
      >
        <div className="card overflow-hidden divide-y divide-warm-100">
          {mergeCandidates.slice(0, 15).map((item, idx) => (
            <div key={idx} className="px-5 py-4 hover:bg-warm-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-accent-500" />
                  <span className="text-sm font-semibold text-warm-800">{item.root}</span>
                </div>
                <span className="text-2xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  ×{item.count} 种措辞
                </span>
              </div>
              <div className="ml-6 space-y-0.5">
                {item.variants.map((v, vi) => (
                  <div key={vi} className="text-xs text-warm-500 flex items-center gap-2">
                    <span className="text-warm-300">├</span>
                    {v}
                  </div>
                ))}
              </div>
              {item.count >= 3 && (
                <p className="ml-6 mt-2 text-2xs text-amber-600 bg-amber-50 px-2 py-1 rounded inline-block">
                  💡 建议统一为一个关键短语
                </p>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ===== 加分项归并建议 ===== */}
      <CollapsibleSection
        title="加分项归并建议"
        subtitle="同一特征被 AI 用多种措辞识别"
        icon={<Zap className="w-4 h-4 text-emerald-500" />}
        show={showMerge}
        onToggle={() => setShowMerge(!showMerge)}
        count={posMergeCandidates.length}
      >
        <div className="card overflow-hidden divide-y divide-warm-100">
          {posMergeCandidates.slice(0, 15).map((item, idx) => (
            <div key={idx} className="px-5 py-4 hover:bg-warm-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-sm font-semibold text-warm-800">{item.root}</span>
                </div>
                <span className="text-2xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">×{item.count} 种措辞</span>
              </div>
              <div className="ml-6 space-y-0.5">
                {item.variants.map((v, vi) => (
                  <div key={vi} className="text-xs text-warm-500 flex items-center gap-2">
                    <span className="text-warm-300">├</span>
                    {v}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ===== 低触发率项 ===== */}
      <CollapsibleSection
        title="低触发率扣分项"
        subtitle="在你的提示词中已定义，但实际触发不到 5 次 — 可能需要调整关键短语或移除此规则"
        icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
        show={showGaps}
        onToggle={() => setShowGaps(!showGaps)}
        count={lowTriggerNeg.length}
      >
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-warm-100 bg-warm-50/50">
                <th className="table-header text-left px-5 py-3">规则</th>
                <th className="table-header text-right px-5 py-3 w-16">分值</th>
                <th className="table-header text-right px-5 py-3 w-16">触发</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {lowTriggerNeg.map((item, idx) => (
                <tr key={idx} className="table-row">
                  <td className="px-5 py-2.5 text-sm text-warm-600">{item.reason}</td>
                  <td className="px-5 py-2.5 text-sm text-red-600 text-right tabular-nums">-{item.score}</td>
                  <td className="px-5 py-2.5 text-sm text-warm-500 text-right tabular-nums">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* ===== Top 频率表 ===== */}
      <section className="grid grid-cols-2 gap-6">
        {/* Top 扣分关键词 */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-100">
            <h3 className="text-sm font-semibold text-red-600 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Top 扣分关键词
            </h3>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-warm-100">
            {bulk.deductions.items.slice(0, 20).map((item, idx) => {
              const max = bulk.deductions.items[0]?.count || 1;
              return (
                <div key={idx} className="px-5 py-2.5 flex items-center gap-3 hover:bg-warm-50 transition-colors">
                  <span className="text-2xs text-warm-400 w-5 text-right tabular-nums flex-shrink-0">{idx + 1}</span>
                  <span className="text-xs text-warm-600 truncate flex-1">{item.reason}</span>
                  <div className="w-12 h-1 rounded-full bg-warm-100 overflow-hidden flex-shrink-0">
                    <div className="h-full rounded-full" style={{
                      width: `${(item.count / max) * 100}%`,
                      background: 'linear-gradient(90deg, #d9704a, #e5835c)',
                    }} />
                  </div>
                  <span className="text-xs text-red-600 font-semibold tabular-nums w-12 text-right flex-shrink-0">
                    ×{item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 加分关键词 */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-100">
            <h3 className="text-sm font-semibold text-emerald-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Top 加分关键词
            </h3>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-warm-100">
            {bulk.positives.items.slice(0, 20).map((item, idx) => {
              const max = bulk.positives.items[0]?.count || 1;
              return (
                <div key={idx} className="px-5 py-2.5 flex items-center gap-3 hover:bg-warm-50 transition-colors">
                  <span className="text-2xs text-warm-400 w-5 text-right tabular-nums flex-shrink-0">{idx + 1}</span>
                  <span className="text-xs text-warm-600 truncate flex-1">{item.reason}</span>
                  <div className="w-12 h-1 rounded-full bg-warm-100 overflow-hidden flex-shrink-0">
                    <div className="h-full rounded-full" style={{
                      width: `${(item.count / max) * 100}%`,
                      background: 'linear-gradient(90deg, #059669, #10b981)',
                    }} />
                  </div>
                  <span className="text-xs text-emerald-600 font-semibold tabular-nums w-12 text-right flex-shrink-0">
                    ×{item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

/** 归并根词提取：保留前 N 个中文字符 */
function extractRoot(reason: string): string {
  return reason.replace(/[，,、。.].*$/, '').trim().slice(0, 15);
}

/** 可折叠区块 */
function CollapsibleSection({
  title, subtitle, icon, show, onToggle, children, count,
}: {
  title: string; subtitle: string; icon: React.ReactNode;
  show: boolean; onToggle: () => void;
  children: React.ReactNode; count: number;
}) {
  return (
    <section className="space-y-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-base font-semibold text-warm-800 hover:text-accent-600 transition-colors w-full text-left"
      >
        {show ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
        {icon}
        {title}
        <span className="text-sm text-warm-400 font-normal">{subtitle}</span>
        <span className="text-2xs text-warm-400 bg-warm-100 px-1.5 py-0.5 rounded">{count} 条</span>
      </button>
      {show && children}
    </section>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { analyzeAllScoringLogs, ArrayCategory } from '@/utils/aiScoringParser';
import Pagination, { usePagination } from '@/components/Pagination';
import { AlertTriangle, TrendingDown, TrendingUp, ChevronDown, ChevronRight, Search, Briefcase, Bug, Database } from 'lucide-react';

const chartColors = [
  '#d9704a', '#6366f1', '#059669', '#d97706',
  '#8b5cf6', '#dc2626', '#0891b2', '#65a30d',
  '#ec4899', '#475569', '#14b8a6', '#f59e0b',
];

export default function DeductionsPage() {
  const navigate = useNavigate();
  const { getFilteredLogs, rawAiScoringLogs } = useAppStore();
  const logs = getFilteredLogs();
  const [searchTerm, setSearchTerm] = useState('');
  const negPage = usePagination(20);
  const posPage = usePagination(20);

  // 以 rawAiScoringLogs 为源头做完整分析
  const bulk = useMemo(() => analyzeAllScoringLogs(rawAiScoringLogs), [rawAiScoringLogs]);

  // Pipeline 数据的状态分布（用于发现"投递成功无评分"这类 bug）
  const pipelineStats = useMemo(() => {
    const allLogs = logs;
    const successCount = allLogs.filter(l => l.status === 'success').length;
    const withAi = allLogs.filter(l => l.aiScoring?.message?.includes('分数')).length;
    const successWithoutAi = allLogs.filter(l =>
      l.status === 'success' && !l.aiScoring?.message?.includes('分数')
    ).length;
    const oldWithoutAi = allLogs.filter(l =>
      !l.aiScoring?.message?.includes('分数')
    ).length - successWithoutAi;
    return {
      total: allLogs.length,
      successCount,
      withAi,
      successWithoutAi,
      oldWithoutAi,
    };
  }, [logs]);

  // 筛选扣分项
  const filteredNeg = useMemo(() => {
    if (!searchTerm) return bulk.deductions.items;
    return bulk.deductions.items.filter(i =>
      i.reason.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bulk, searchTerm]);

  // 筛选加分项
  const filteredPos = useMemo(() => {
    if (!searchTerm) return bulk.positives.items;
    return bulk.positives.items.filter(i =>
      i.reason.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bulk, searchTerm]);

  if (rawAiScoringLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center">
          <Database className="w-7 h-7 text-warm-400" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-warm-500">暂无 AI 评分数据，请先加载</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-3xl tracking-tight text-warm-900">AI 评分扣分分析</h2>
          <span className="badge badge--neutral text-2xs">实时数据源</span>
        </div>
        <span className="text-xs text-warm-400">
          {bulk.totalScoringLogs} 条 AI 评分 · {bulk.withScoreLogs} 条含评分文本
        </span>
      </div>

      {/* 数据状态总览 */}
      <section className="grid grid-cols-5 gap-4">
        <div className="card p-5 space-y-1">
          <p className="stat-label">AI 评分日志总数</p>
          <p className="stat-number">{bulk.totalScoringLogs}</p>
          <p className="text-2xs text-warm-400">{bulk.withScoreLogs} 条含具体评分</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-red-400">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-red-500" />
            <p className="stat-label text-red-600">含扣分项</p>
          </div>
          <p className="stat-number text-red-600">{bulk.withDeductions}</p>
          <p className="text-2xs text-warm-400">共 {bulk.deductions.totalItems} 条扣分</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-emerald-400">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <p className="stat-label text-emerald-600">含加分项</p>
          </div>
          <p className="stat-number text-emerald-600">{bulk.withPositives}</p>
          <p className="text-2xs text-warm-400">共 {bulk.positives.totalItems} 条加分</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-accent-400">
          <p className="stat-label text-accent-600">扣分关键词种类</p>
          <p className="stat-number text-accent-500">{bulk.deductions.uniqueReasons}</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-emerald-400">
          <p className="stat-label text-emerald-600">加分关键词种类</p>
          <p className="stat-number text-emerald-600">{bulk.positives.uniqueReasons}</p>
        </div>
      </section>

      {/* Bug 提示：投递成功但无 AI 评分 */}
      {pipelineStats.successWithoutAi > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <Bug className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-amber-700">
                  检测到「投递成功但无 AI 评分」记录
                </p>
                <span className="badge badge--warning text-2xs">{pipelineStats.successWithoutAi} 条</span>
              </div>
              <div className="text-xs text-amber-700 space-y-1">
                <p>分析数据：</p>
                <ul className="space-y-0.5 ml-4 list-disc">
                  <li>Pipeline 总数 <strong>{pipelineStats.total}</strong> 条</li>
                  <li>已评分（有 AI 评分）<strong>{pipelineStats.withAi}</strong> 条</li>
                  <li>「投递成功」且无 AI 评分 <strong>{pipelineStats.successWithoutAi}</strong> 条 <em>（这部分匹配不上 AI 评分，可能丢了数据）</em></li>
                  <li>「旧数据」（无 AI 评分，且非投递成功）<strong>{pipelineStats.oldWithoutAi}</strong> 条</li>
                </ul>
                <p className="text-amber-600">
                  原因可能是：插件没记录到对应 AI 评分，或记录被截断。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 扣分项 / 加分项 两个面板（tab 切换） */}
      <DeductionsSection
        title="扣分项统计"
        icon={<TrendingDown className="w-4 h-4 text-red-500" strokeWidth={2} />}
        category={bulk.deductions}
        filtered={filteredNeg}
        search={searchTerm}
        setSearch={setSearchTerm}
        page={negPage}
        itemType="negative"
        navigate={navigate}
      />

      <DeductionsSection
        title="加分项统计"
        icon={<TrendingUp className="w-4 h-4 text-emerald-500" strokeWidth={2} />}
        category={bulk.positives}
        filtered={filteredPos}
        search={searchTerm}
        setSearch={setSearchTerm}
        page={posPage}
        itemType="positive"
        navigate={navigate}
      />
    </div>
  );
}

function DeductionsSection({
  title, icon, category, filtered, search, setSearch, page, itemType, navigate,
}: {
  title: string;
  icon: React.ReactNode;
  category: ArrayCategory;
  filtered: Array<{ reason: string; score: number; count: number; totalScore: number; jobIds: string[]; variants: string[] }>;
  search: string;
  setSearch: (s: string) => void;
  page: { page: number; pageSize: number; onPageChange: (p: number) => void; onPageSizeChange: (n: number) => void };
  itemType: 'negative' | 'positive';
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(expandedSets);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedSets(next);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-warm-800 flex items-center gap-2">
          {icon}
          {title}
          <span className="text-sm font-normal text-warm-400">
            共 {category.totalItems} 条 · {category.uniqueReasons} 个关键词
          </span>
        </h3>
      </div>

      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
        <input
          type="text"
          placeholder={`搜索${itemType === 'negative' ? '扣分' : '加分'}项...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-warm-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-accent-300"
        />
      </div>

      <div className="card overflow-hidden divide-y divide-warm-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-warm-400">暂无数据</div>
        ) : (
          filtered
            .slice((page.page - 1) * page.pageSize, page.page * page.pageSize)
            .map((item, idx) => {
              const realIdx = filtered.indexOf(item);
              const max = filtered[0]?.count || 1;
              const hasVariants = item.variants.length > 0;
              const isExpanded = expandedSets.has(item.reason);

              return (
                <div key={idx} className="group">
                  <div
                    className={`px-5 py-3 hover:bg-warm-50 transition-colors ${hasVariants ? 'cursor-pointer' : ''}`}
                    onClick={() => hasVariants && toggle(item.reason)}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: itemType === 'negative' ? chartColors[realIdx % chartColors.length] : '#059669' }}
                        />
                        <span className="text-sm text-warm-700 truncate">{item.reason}</span>
                        {hasVariants && (
                          <span className="text-2xs text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                            {isExpanded ? '收起' : `${item.variants.length} 种措辞`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs font-semibold ${itemType === 'negative' ? 'text-red-600' : 'text-emerald-600'}`}>
                          {itemType === 'negative' ? '-' : '+'}{item.score} 均分
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${itemType === 'negative' ? 'text-red-600' : 'text-emerald-600'}`}>
                          ×{item.count}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-warm-100 overflow-hidden">
                      <div className="h-full" style={{
                        width: `${(item.count / max) * 100}%`,
                        background: itemType === 'negative'
                          ? 'linear-gradient(90deg, #d9704a, #e5835c)'
                          : 'linear-gradient(90deg, #059669, #10b981)',
                      }} />
                    </div>
                  </div>

                  {/* 合并变体展开 */}
                  {hasVariants && isExpanded && (
                    <div className="bg-warm-50 border-t border-warm-100 px-5 py-3 ml-6">
                      <p className="text-2xs text-warm-500 mb-2">AI 用以下多种措辞表达了同一概念：</p>
                      <div className="space-y-1">
                        {item.variants.map((v, vi) => (
                          <div key={vi} className="text-xs text-warm-600 flex items-center gap-2">
                            <span className="text-warm-300">├</span>
                            {v}
                          </div>
                        ))}
                      </div>
                      <p className="text-2xs text-amber-600 bg-amber-50 px-2 py-1 rounded mt-2 inline-block">
                        💡 提示词优化：在提示词中统一这个关键短语
                      </p>
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>
      <Pagination {...page} total={filtered.length} label="项" />
    </section>
  );
}

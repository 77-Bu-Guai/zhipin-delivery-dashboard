import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { analyzeAllScoringLogs, ArrayCategory, loadFactorCategories } from '@/utils/aiScoringParser';
import Pagination, { usePagination } from '@/components/Pagination';
import { TrendingDown, TrendingUp, Search, Database } from 'lucide-react';

const chartColors = [
  '#d9704a', '#6366f1', '#059669', '#d97706',
  '#8b5cf6', '#dc2626', '#0891b2', '#65a30d',
  '#ec4899', '#475569', '#14b8a6', '#f59e0b',
];

// 时间范围切换（与今日页一致：今日 / 本周 / 本月 / 全部）
type TimeRange = 'today' | 'week' | 'month' | 'all';

const TIME_TABS: { key: TimeRange; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

// ts 为 AiScoringLog.time（毫秒时间戳，number）
function isInRange(ts: number, range: TimeRange): boolean {
  if (range === 'all') return true;
  const logDate = new Date(ts);
  const now = new Date();
  if (range === 'today') {
    return logDate.toLocaleDateString('zh-CN') === now.toLocaleDateString('zh-CN');
  }
  if (range === 'week') {
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return logDate >= monday && logDate <= sunday;
  }
  if (range === 'month') {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    return logDate >= thirtyDaysAgo && logDate <= now;
  }
  return true;
}

export default function DeductionsPage() {
  const { rawAiScoringLogs } = useAppStore();
  const [activeRange, setActiveRange] = useState<TimeRange>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [factorMaps, setFactorMaps] = useState<{ negative: Record<string, string>; positive: Record<string, string> } | null>(null);
  const negPage = usePagination(20);
  const posPage = usePagination(20);

  // 加载 MiMo 20 大类 factor 分类映射
  useEffect(() => {
    let mounted = true;
    loadFactorCategories().then((cats) => {
      if (!mounted || !cats) return;
      setFactorMaps({ negative: cats.negativeMap, positive: cats.positiveMap });
    });
    return () => { mounted = false; };
  }, []);

  // 按时间范围过滤 AI 评分日志
  const rangeLogs = useMemo(
    () => rawAiScoringLogs.filter(l => isInRange(l.time, activeRange)),
    [rawAiScoringLogs, activeRange],
  );

  // 以 rangeLogs 为源头做完整分析（优先使用 AI 20 大类聚合）
  const bulk = useMemo(() => analyzeAllScoringLogs(rangeLogs, factorMaps), [rangeLogs, factorMaps]);

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight text-warm-900">AI 评分扣分分析</h2>
          <span className="badge badge--neutral text-2xs">实时数据源</span>
        </div>

        {/* 时间范围切换 */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-warm-400">
            {TIME_TABS.find(t => t.key === activeRange)?.label} · {bulk.totalScoringLogs} 条评分 · {bulk.withScoreLogs} 含文本
          </span>
          <div className="flex rounded-lg bg-warm-50 border border-warm-200 p-0.5">
            {TIME_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveRange(tab.key)}
                className={`px-3.5 py-2 rounded-md text-sm font-medium transition-all ${
                  activeRange === tab.key
                    ? 'bg-white text-warm-800 shadow-sm border border-warm-200/80'
                    : 'text-warm-400 hover:text-warm-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 当前时间段无数据提示 */}
      {rangeLogs.length === 0 && rawAiScoringLogs.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-warm-50 border border-warm-200 text-sm text-warm-500">
          <Search className="w-4 h-4 text-warm-400" strokeWidth={1.5} />
          当前「{TIME_TABS.find(t => t.key === activeRange)?.label}」范围内没有 AI 评分记录，试试切换到「全部」查看历史数据。
        </div>
      )}

      {/* 数据状态总览 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <div className="card p-5 space-y-1">
          <p className="stat-label">AI 评分日志总数</p>
          <p className="stat-number text-2xl sm:text-3xl lg:text-4xl">{bulk.totalScoringLogs}</p>
          <p className="text-2xs text-warm-400">{bulk.withScoreLogs} 条含具体评分</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-red-400">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-red-500" />
            <p className="stat-label text-red-600">含扣分项</p>
          </div>
          <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-red-600">{bulk.withDeductions}</p>
          <p className="text-2xs text-warm-400">共 {bulk.deductions.totalItems} 条扣分</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-emerald-400">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <p className="stat-label text-emerald-600">含加分项</p>
          </div>
          <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-emerald-600">{bulk.withPositives}</p>
          <p className="text-2xs text-warm-400">共 {bulk.positives.totalItems} 条加分</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-accent-400">
          <p className="stat-label text-accent-600">扣分关键词种类</p>
          <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-accent-500">{bulk.deductions.uniqueReasons}</p>
        </div>
        <div className="card p-5 space-y-1 border-l-[3px] border-l-emerald-400">
          <p className="stat-label text-emerald-600">加分关键词种类</p>
          <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-emerald-600">{bulk.positives.uniqueReasons}</p>
        </div>
      </section>

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
      />
    </div>
  );
}

function DeductionsSection({
  title, icon, category, filtered, search, setSearch, page, itemType,
}: {
  title: string;
  icon: React.ReactNode;
  category: ArrayCategory;
  filtered: Array<{ reason: string; score: number; count: number; totalScore: number; jobIds: string[]; variants: string[] }>;
  search: string;
  setSearch: (s: string) => void;
  page: { page: number; pageSize: number; onPageChange: (p: number) => void; onPageSizeChange: (n: number) => void };
  itemType: 'negative' | 'positive';
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

      <div className="relative w-full max-w-xs">
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
                        <span className="text-sm text-warm-700 truncate" title={item.reason}>{item.reason}</span>
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

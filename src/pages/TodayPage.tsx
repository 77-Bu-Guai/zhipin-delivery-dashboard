import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { classifyJob, getAllCategories } from '@/utils/jobCategories';
import Pagination from '@/components/Pagination';
import { ScoreBar, NegativeList, PositiveChips } from '@/components/FilterReasonColumn';
import {
  ChevronRight, RefreshCw, Zap, Download,
  CheckCircle2, XCircle, AlertTriangle, X as XIcon,
} from 'lucide-react';

// ============================================================
// 筛选原因 — 兼容旧逻辑，AI 评分的情况交给 FilterReasonColumn
// ============================================================

function getFallbackReason(log: any): string {
  const stateName = log.filterStateName || '';
  // 活跃度过滤 — 直接用原始消息
  if (stateName.includes('活跃度') || stateName.includes('活跃')) {
    const rawMsg = log.aiScoring?.message || log.message || '';
    return rawMsg.replace(/^不活跃[,，]\s*/, '') || 'HR 活跃度不足';
  }
  // 其他类型
  return stateName || log.message || '未知原因';
}

// ============================================================
// 类型定义
// ============================================================

type TimeRange = 'today' | 'week' | 'month' | 'all';
type StatusFilter = string; // 支持任意 state_name，'all' = 全部

const TIME_TABS: { key: TimeRange; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

function isInRange(timestamp: string, range: TimeRange): boolean {
  if (range === 'all') return true;
  const logDate = new Date(timestamp);
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

// ============================================================
// 导出
// ============================================================

function exportCsv(logs: any[], label: string) {
  const headers = ['岗位分类', '岗位名称', '公司名字', '筛选结果', '筛选原因', '浏览器', '投递时间'];
  const rows = logs.map(log => {
    const { category } = classifyJob(log.jobTitle);
    const stateLabel = log.state_name || log.status || '-';
    const reason = getFallbackReason(log);
    const browserLabel = log.browser === 'chrome' ? 'Chrome' : log.browser === 'firefox' ? 'Firefox' : '-';
    const time = new Date(log.timestamp).toLocaleString('zh-CN');
    return [category, log.jobTitle, log.companyName, stateLabel, reason, browserLabel, time];
  });
  const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BOSS投递报告_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Page
// ============================================================

export default function TodayPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getFilteredLogs, refreshData, isLoading, lastFullReload } = useAppStore();
  const allLogs = getFilteredLogs();

  const initialRange = (searchParams.get('range') as TimeRange) || 'all';
  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all';

  const [activeRange, setActiveRange] = useState<TimeRange>(
    ['today', 'week', 'month', 'all'].includes(initialRange) ? initialRange : 'all'
  );
  const [activeStatus, setActiveStatus] = useState<StatusFilter>(
    (initialStatus && initialStatus !== 'all') ? initialStatus : 'all'
  );
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [countdown, setCountdown] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const intervalRef = useRef<number | null>(null);

  const fullReloadCountdown = useMemo(() => {
    if (!lastFullReload) return 60;
    const elapsed = Math.floor((Date.now() - lastFullReload.getTime()) / 1000);
    return Math.max(0, 60 - elapsed);
  }, [lastFullReload, countdown]);

  useEffect(() => {
    const tick = () => {
      setCountdown((c) => (c <= 1 ? 10 : c - 1));
    };
    intervalRef.current = window.setInterval(tick, 1000);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (activeStatus === 'all') params.delete('status');
    else params.set('status', activeStatus);
    if (activeRange === 'all') params.delete('range');
    else params.set('range', activeRange);
    setSearchParams(params, { replace: true });
  }, [activeStatus, activeRange]);

  // 筛选 + 排序
  const filteredLogs = useMemo(() => {
    let result = allLogs.filter(l => isInRange(l.timestamp, activeRange));

    if (activeStatus === 'success') {
      result = result.filter(l => l.status === 'success');
    } else if (activeStatus !== 'all') {
      // 按具体 state_name 筛选
      result = result.filter(l => {
        const sn = l.filterStateName || '';
        return sn === activeStatus || (!sn && l.status !== 'success' && activeStatus === '其他原因');
      });
    }

    if (activeCategory !== 'all') {
      result = result.filter(l => classifyJob(l.jobTitle).category === activeCategory);
    }

    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allLogs, activeRange, activeStatus, activeCategory]);

  useEffect(() => { setCurrentPage(1); }, [activeRange, activeStatus, activeCategory, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedLogs = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);

  // 统计
  const totalCount = allLogs.filter(l => isInRange(l.timestamp, activeRange)).length;
  const successCount = allLogs.filter(l => isInRange(l.timestamp, activeRange) && l.status === 'success').length;

  // 按 state_name 动态统计各筛选类型数量
  const filterTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const rangeLogs = allLogs.filter(l => isInRange(l.timestamp, activeRange));
    rangeLogs.forEach(l => {
      if (l.status === 'success') return; // 投递成功不算
      const sn = l.filterStateName || '其他原因';
      counts[sn] = (counts[sn] || 0) + 1;
    });
    return counts;
  }, [allLogs, activeRange]);

  const rangeLabel = TIME_TABS.find(t => t.key === activeRange)?.label || '全部';

  if (allLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-warm-400" strokeWidth={1.5} />
        </div>
        <p className="text-warm-500 text-sm">暂无投递数据</p>
        <button onClick={() => navigate('/')} className="btn btn--primary btn--lg">导入数据</button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      {/* ===== 顶栏：标题 + 操作 ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-3xl tracking-tight text-warm-900">投递记录</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
              <Zap className="w-3 h-3" /> 实时
            </span>
            <span className="text-warm-400 font-mono tabular-nums">{countdown}s</span>
            <span className="text-warm-300">/</span>
            <span className="text-warm-400 font-mono tabular-nums">{fullReloadCountdown}s</span>
            <button onClick={() => { refreshData(); setCountdown(5); }} disabled={isLoading} className="btn btn--ghost btn--sm">
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> 刷新
            </button>
            <button onClick={() => exportCsv(pagedLogs, rangeLabel)} className="btn btn--ghost btn--sm">
              <Download className="w-3 h-3" /> 导出
            </button>
          </div>
        </div>

        {/* 时间范围 */}
        <div className="flex items-center gap-3">
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
          <span className="text-xs text-warm-400">
            {rangeLabel}投递 <span className="text-warm-700 font-semibold">{pagedLogs.length}</span> 条
          </span>
        </div>
      </div>

      {/* ===== 状态筛选 ===== */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveStatus('all')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            activeStatus === 'all' ? 'bg-white text-warm-800 shadow-sm border-warm-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
          }`}
        >
          全部
          <span className="text-2xs px-1.5 py-0.5 rounded font-semibold bg-warm-100 text-warm-600">{totalCount}</span>
        </button>
        <button
          onClick={() => setActiveStatus('success')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            activeStatus === 'success' ? 'bg-white text-emerald-700 shadow-sm border-emerald-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          投递成功
          <span className="text-2xs px-1.5 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-600">{successCount}</span>
        </button>
        {/* 各筛选类型（按数量降序） */}
        {Object.entries(filterTypeCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([stateName, count]) => (
            <button
              key={stateName}
              onClick={() => setActiveStatus(activeStatus === stateName ? 'all' : stateName)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                activeStatus === stateName ? 'bg-white text-red-700 shadow-sm border-red-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-red-500" />
              {stateName}
              <span className="text-2xs px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-600">{count}</span>
            </button>
          ))}
      </div>

      {/* ===== 分类筛选 ===== */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
            activeCategory === 'all' ? 'bg-white text-warm-800 shadow-sm border-warm-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
          }`}
        >
          全部分类
        </button>
        {getAllCategories().map(({ category, color }) => {
          const count = allLogs.filter(l =>
            isInRange(l.timestamp, activeRange) &&
            classifyJob(l.jobTitle).category === category &&
            (activeStatus === 'all' || activeStatus === 'success'
              ? (activeStatus === 'success' ? l.status === 'success' : true)
              : (l.filterStateName || (l.status !== 'success' ? '其他原因' : '')) === activeStatus)
          ).length;
          if (count === 0) return null;
          return (
            <button
              key={category}
              onClick={() => setActiveCategory(activeCategory === category ? 'all' : category)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                activeCategory === category ? 'bg-white shadow-sm' : 'bg-warm-50 hover:bg-warm-100'
              }`}
              style={activeCategory === category ? { borderColor: color, color } : { borderColor: '#e8e5dd', color: '#8b877a' }}
            >
              {category}
              <span className="ml-1.5 text-2xs opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* ===== 投递列表 ===== */}
      <div className="card overflow-hidden">
        {pagedLogs.length === 0 ? (
          <div className="py-20 text-center text-sm text-warm-400">暂无匹配记录</div>
        ) : (
          <table className="w-full table-fixed">
            <thead>
              {/* ── 单行表头：8 列同一级 ── */}
              <tr className="border-b border-warm-100 bg-warm-50/50">
                <th className="px-3 py-3 text-left text-2xs font-semibold text-warm-400 uppercase tracking-wider w-14">分类</th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-warm-400 uppercase tracking-wider" style={{ width: '18%' }}>岗位名称</th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-warm-400 uppercase tracking-wider w-28">公司</th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-warm-400 uppercase tracking-wider w-20">时间</th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-warm-400 uppercase tracking-wider w-24">结果</th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-warm-400 uppercase tracking-wider w-28">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="w-3 h-3 text-accent-500" />
                    AI 评分
                  </span>
                </th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-red-500 uppercase tracking-wider w-36">
                  <span className="inline-flex items-center gap-1">
                    <XIcon className="w-3 h-3" />
                    消极
                  </span>
                </th>
                <th className="px-3 py-3 text-left text-2xs font-semibold text-emerald-500 uppercase tracking-wider w-40">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    积极
                  </span>
                </th>
                <th className="px-3 py-3 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {pagedLogs.map(log => {
                const { category, color } = classifyJob(log.jobTitle);
                  const isSuccess = log.status === 'success';
                  const stateLabel = log.filterStateName || (isSuccess ? '投递成功' : '系统筛选');
                  const reason = isSuccess ? (log.message || '投递成功') : getFallbackReason(log);

                return (
                  <tr
                    key={log.id}
                    className="cursor-pointer table-row"
                    onClick={() => {
                      const qs = new URLSearchParams();
                      qs.set('from', 'today');
                      if (activeStatus !== 'all') qs.set('status', activeStatus);
                      if (activeRange !== 'all') qs.set('range', activeRange);
                      navigate(`/job/${log.id}?${qs.toString()}`);
                    }}
                  >
                    {/* 分类 */}
                    <td className="px-3 py-3">
                      <span
                        className="text-2xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
                      >
                        {category}
                      </span>
                    </td>

                    {/* 岗位名 */}
                    <td className="px-3 py-3">
                      <span className="text-sm text-warm-800 truncate block max-w-[180px] font-medium">
                        {log.jobTitle}
                      </span>
                    </td>

                    {/* 公司 */}
                    <td className="px-3 py-3">
                      <span className="text-sm text-warm-600 truncate block max-w-[120px]">
                        {log.companyName}
                      </span>
                    </td>

                    {/* 时间 */}
                    <td className="px-3 py-3">
                      <span className="text-xs text-warm-400 font-mono tabular-nums whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </td>

                    {/* 结果 */}
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
                        isSuccess
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {stateLabel}
                      </span>
                    </td>

                    {/* AI 评分 */}
                    <td className="px-3 py-3">
                      {isSuccess ? (
                        <span className="text-xs text-emerald-600">{log.message || '投递成功'}</span>
                      ) : (
                        <ScoreBar
                          message={log.aiScoring?.message}
                          fallback={reason}
                        />
                      )}
                    </td>

                    {/* 消极 */}
                    <td className="px-3 py-3 overflow-hidden">
                      {isSuccess ? (
                        <span className="text-xs text-warm-400">—</span>
                      ) : (
                        <NegativeList message={log.aiScoring?.message} />
                      )}
                    </td>

                    {/* 积极 */}
                    <td className="px-3 py-3 overflow-hidden">
                      {isSuccess ? (
                        <span className="text-xs text-warm-400">—</span>
                      ) : (
                        <PositiveChips message={log.aiScoring?.message} />
                      )}
                    </td>

                    {/* 查看 */}
                    <td className="px-5 py-3 pr-4">
                      <ChevronRight className="w-4 h-4 text-warm-300 group-hover:text-accent-500 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {filteredLogs.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={filteredLogs.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            label="条"
          />
        )}
      </div>
    </div>
  );
}

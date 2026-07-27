import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import {
  FileDown, Calendar, Download, Filter, RefreshCw, TrendingUp,
  CheckCircle2, ShieldX, Clock, Sparkles,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Pagination, { usePagination } from '@/components/Pagination';

/* ============================================================
   状态 → 徽章样式映射
   ============================================================ */
const STATUS_META: Record<string, {
  label: string;
  badgeClass: string;
  dotClass: string;
}> = {
  success: {
    label: '投递成功',
    badgeClass: 'badge--success',
    dotClass: 'bg-emerald-500',
  },
  screened: {
    label: '系统筛选',
    badgeClass: 'badge--warning',
    dotClass: 'bg-amber-500',
  },
  failed: {
    label: 'AI 评分<20',
    badgeClass: 'badge--error',
    dotClass: 'bg-red-500',
  },
  pending: {
    label: '待处理',
    badgeClass: 'badge--neutral',
    dotClass: 'bg-warm-400',
  },
};

const BROWSER_META: Record<string, { label: string; icon: string }> = {
  chrome:  { label: 'Chrome',  icon: '🟢' },
  firefox: { label: 'Firefox', icon: '🟠' },
};

/* ============================================================
   快捷日期范围
   ============================================================ */
type QuickRange = 'today' | '7d' | '30d' | 'all';
const QUICK_RANGES: { value: QuickRange; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: '7d',    label: '近 7 天' },
  { value: '30d',   label: '近 30 天' },
  { value: 'all',   label: '全部' },
];

function getQuickRange(value: QuickRange): [Date, Date] | null {
  if (value === 'all') return null;
  const end = new Date();
  const start = new Date();
  if (value === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (value === '7d') {
    start.setDate(end.getDate() - 7);
  } else if (value === '30d') {
    start.setDate(end.getDate() - 30);
  }
  return [start, end];
}

/* ============================================================
   状态统计小卡
   ============================================================ */
function StatCard({
  label, value, total, accent, icon: Icon, index,
}: {
  label: string;
  value: number;
  total: number;
  accent: 'accent' | 'success' | 'warning' | 'neutral';
  icon: React.ElementType;
  index: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const accentMap = {
    accent:  { bar: 'bg-accent-500',  text: 'text-accent-600', icon: 'text-accent-500' },
    success: { bar: 'bg-emerald-500', text: 'text-emerald-600', icon: 'text-emerald-500' },
    warning: { bar: 'bg-amber-500',   text: 'text-amber-600',   icon: 'text-amber-500' },
    neutral: { bar: 'bg-warm-400',    text: 'text-warm-600',    icon: 'text-warm-500' },
  }[accent];

  return (
    <div
      className={`card p-5 animate-in animate-in--delay-${index + 1} group`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="stat-label">{label}</p>
          <p className={`stat-number ${accentMap.text}`}>{value.toLocaleString()}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg bg-warm-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-4 h-4 ${accentMap.icon}`} strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-warm-100 overflow-hidden">
          <div
            className={`h-full ${accentMap.bar} rounded-full transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-2xs text-warm-500 tabular-nums font-medium">{pct}%</span>
      </div>
    </div>
  );
}

/* ============================================================
   主组件
   ============================================================ */
export default function ExportPage() {
  const navigate = useNavigate();
  const { getFilteredLogs, setFilterOptions, filterOptions, logs } = useAppStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quickRange, setQuickRange] = useState<QuickRange>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const pagination = usePagination(20);

  const filteredLogs = getFilteredLogs();
  const pagedLogs = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredLogs.slice(start, start + pagination.pageSize);
  }, [filteredLogs, pagination.page, pagination.pageSize]);

  // 统计
  const stats = useMemo(() => {
    const success  = filteredLogs.filter(l => l.status === 'success').length;
    const screened = filteredLogs.filter(l => l.status === 'screened').length;
    const failed   = filteredLogs.filter(l => l.status === 'failed').length;
    const pending  = filteredLogs.filter(l => l.status === 'pending').length;
    return { total: filteredLogs.length, success, screened, failed, pending };
  }, [filteredLogs]);

  /* ---------- 筛选 ---------- */
  const handleApplyFilter = () => {
    if (startDate && endDate) {
      setFilterOptions({
        dateRange: [new Date(startDate), new Date(endDate)],
      });
      setQuickRange('all');
    } else {
      setFilterOptions({ dateRange: null });
      setQuickRange('all');
    }
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setQuickRange('all');
    setFilterOptions({ dateRange: null });
  };

  const handleQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    const r = getQuickRange(range);
    if (r) {
      // datetime-local 需要 yyyy-MM-ddTHH:mm
      const fmt = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setStartDate(fmt(r[0]));
      setEndDate(fmt(r[1]));
      setFilterOptions({ dateRange: r });
    } else {
      setStartDate('');
      setEndDate('');
      setFilterOptions({ dateRange: null });
    }
  };

  /* ---------- 导出 PDF ---------- */
  const handleExportPDF = async () => {
    if (!exportRef.current || filteredLogs.length === 0) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#faf9f6',
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - 20;
      }
      const dateStr = new Date().toISOString().slice(0, 10);
      pdf.save(`Boss投递报告_${dateStr}.pdf`);
    } catch (error) {
      console.error('PDF 生成失败:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  /* ---------- 空数据 ---------- */
  if (logs.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[65vh] space-y-5 animate-in">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
          <FileDown className="w-8 h-8 text-warm-400" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-warm-700">暂无数据</h2>
          <p className="text-sm text-warm-400">导入日志数据，开始导出投递报告</p>
        </div>
        <button onClick={() => navigate('/')} className="btn btn--primary btn--lg">
          前往导入
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in">
      {/* ================== 页面标题 ================== */}
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl tracking-tight text-warm-900">
            导出报告
          </h1>
          <span className="text-2xs text-warm-400 uppercase tracking-widest font-mono">
            Export · PDF
          </span>
        </div>
        <p className="text-warm-500">
          按日期时间筛选投递记录，导出可分享的 PDF 报告
        </p>
      </header>

      {/* ================== 日期筛选 ================== */}
      <section className="card p-6 animate-in animate-in--delay-1">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-warm-800 flex items-center gap-2">
            <Filter className="w-4 h-4 text-accent-500" strokeWidth={2} />
            日期筛选
          </h2>

          {/* 快捷范围 */}
          <div className="flex rounded-lg bg-warm-50 border border-warm-200 p-0.5">
            {QUICK_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => handleQuickRange(r.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                  quickRange === r.value
                    ? 'bg-white text-warm-800 shadow-sm border border-warm-200/80'
                    : 'text-warm-400 hover:text-warm-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-2xs text-warm-500 flex items-center gap-1 font-medium">
              <Calendar className="w-3 h-3" /> 开始日期
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input w-full"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-2xs text-warm-500 flex items-center gap-1 font-medium">
              <Calendar className="w-3 h-3" /> 结束日期
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input w-full"
            />
          </div>
          <button onClick={handleApplyFilter} className="btn btn--primary">
            <Filter className="w-3.5 h-3.5" />
            应用筛选
          </button>
          <button onClick={handleClearFilter} className="btn btn--secondary">
            <RefreshCw className="w-3.5 h-3.5" />
            清除
          </button>
        </div>

        {/* 当前筛选提示 */}
        {filterOptions.dateRange && (
          <div className="mt-4 flex items-center gap-2 text-2xs text-warm-500">
            <Sparkles className="w-3 h-3 text-accent-500" />
            <span>已筛选：</span>
            <span className="font-mono text-warm-700">
              {new Date(filterOptions.dateRange[0]).toLocaleString('zh-CN', { hour12: false })}
            </span>
            <span>→</span>
            <span className="font-mono text-warm-700">
              {new Date(filterOptions.dateRange[1]).toLocaleString('zh-CN', { hour12: false })}
            </span>
          </div>
        )}
      </section>

      {/* ================== 数据统计卡片 ================== */}
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          label="投递总数"
          value={stats.total}
          total={stats.total || 1}
          accent="accent"
          icon={TrendingUp}
          index={1}
        />
        <StatCard
          label="投递成功"
          value={stats.success}
          total={stats.total || 1}
          accent="success"
          icon={CheckCircle2}
          index={2}
        />
        <StatCard
          label="系统筛选"
          value={stats.screened}
          total={stats.total || 1}
          accent="warning"
          icon={ShieldX}
          index={3}
        />
        <StatCard
          label="AI 评分<20"
          value={stats.failed}
          total={stats.total || 1}
          accent="neutral"
          icon={Clock}
          index={4}
        />
      </section>

      {/* ================== 报告预览 ================== */}
      <section className="card overflow-hidden animate-in animate-in--delay-5">
        <div ref={exportRef} style={{ backgroundColor: '#ffffff' }}>
          {/* 报告头部 */}
          <header className="p-6 border-b border-warm-100 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl text-warm-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-accent-500" strokeWidth={2} />
                Boss 直聘投递报告
              </h2>
              <p className="text-2xs text-warm-400 mt-1.5 flex items-center gap-3 font-mono">
                <span>生成时间：{new Date().toLocaleString('zh-CN', { hour12: false })}</span>
                {filterOptions.dateRange && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-warm-300" />
                    <span>
                      筛选：{new Date(filterOptions.dateRange[0]).toLocaleDateString('zh-CN')}
                      {' - '}
                      {new Date(filterOptions.dateRange[1]).toLocaleDateString('zh-CN')}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl tabular-nums text-accent-600">
                {stats.total.toLocaleString()}
              </p>
              <p className="stat-label mt-0.5">投递记录</p>
            </div>
          </header>

          {/* 状态分布条 */}
          <div className="px-6 py-4 bg-warm-50/50 border-b border-warm-100 flex items-center gap-3">
            <span className="text-2xs text-warm-500 font-medium uppercase tracking-wider">
              状态分布
            </span>
            <div className="flex-1 h-2 rounded-full bg-warm-100 overflow-hidden flex">
              {stats.total > 0 && (
                <>
                  <div
                    className="bg-emerald-500 transition-all duration-700"
                    style={{ width: `${(stats.success / stats.total) * 100}%` }}
                    title={`投递成功 ${stats.success}`}
                  />
                  <div
                    className="bg-amber-500 transition-all duration-700"
                    style={{ width: `${(stats.screened / stats.total) * 100}%` }}
                    title={`系统筛选 ${stats.screened}`}
                  />
                  <div
                    className="bg-red-500 transition-all duration-700"
                    style={{ width: `${(stats.failed / stats.total) * 100}%` }}
                    title={`AI 评分<20 ${stats.failed}`}
                  />
                  {stats.pending > 0 && (
                    <div
                      className="bg-warm-400 transition-all duration-700"
                      style={{ width: `${(stats.pending / stats.total) * 100}%` }}
                      title={`待处理 ${stats.pending}`}
                    />
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-2xs">
              {(['success', 'screened', 'failed', 'pending'] as const).map(s => {
                const meta = STATUS_META[s];
                const count = stats[s];
                if (count === 0 && s === 'pending') return null;
                return (
                  <div key={s} className="flex items-center gap-1.5 text-warm-600">
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                    <span className="font-medium">{meta.label}</span>
                    <span className="font-mono text-warm-800 tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-warm-200 bg-warm-50/50">
                  <th className="table-header text-left px-6 py-3 w-16">序号</th>
                  <th className="table-header text-left px-6 py-3 w-44">投递时间</th>
                  <th className="table-header text-left px-6 py-3">公司名称</th>
                  <th className="table-header text-left px-6 py-3">岗位名称</th>
                  <th className="table-header text-left px-6 py-3 w-32">状态</th>
                  <th className="table-header text-left px-6 py-3 w-24">浏览器</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-warm-400">
                        <Filter className="w-8 h-8" strokeWidth={1.5} />
                        <p className="text-sm">当前筛选条件下无投递记录</p>
                        <p className="text-2xs">调整日期范围或清除筛选条件</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedLogs.map((log, index) => {
                    const meta = STATUS_META[log.status] || STATUS_META.pending;
                    const browser = BROWSER_META[log.browser || ''] || { label: '浏览器', icon: '•' };
                    const seq = (pagination.page - 1) * pagination.pageSize + index + 1;
                    return (
                      <tr key={log.id} className="table-row">
                        <td className="table-cell text-warm-400 font-mono tabular-nums">
                          {seq.toString().padStart(3, '0')}
                        </td>
                        <td className="table-cell text-warm-500 font-mono text-xs whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('zh-CN', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', hour12: false,
                          })}
                        </td>
                        <td className="table-cell text-warm-900 font-medium">
                          {log.companyName}
                        </td>
                        <td className="table-cell text-warm-700">
                          {log.jobTitle}
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${meta.badgeClass}`}>
                            <span className={`w-1 h-1 rounded-full ${meta.dotClass}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="table-cell text-warm-500 text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{browser.icon}</span>
                            <span>{browser.label}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 分页（仅当有数据时） */}
        {filteredLogs.length > 0 && (
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filteredLogs.length}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
            label="条记录"
          />
        )}
      </section>

      {/* ================== 下载按钮 ================== */}
      <div className="flex justify-center pt-2 animate-in animate-in--delay-5">
        <button
          onClick={handleExportPDF}
          disabled={isGenerating || filteredLogs.length === 0}
          className="group relative flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-accent-500 text-white font-semibold text-sm hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 shadow-sm hover:shadow-glow active:scale-[0.98]"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              正在生成 PDF...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 group-hover:animate-bounce" strokeWidth={2.25} />
              下载 PDF 报告
              <span className="text-2xs opacity-80 font-mono font-normal pl-1">
                ({stats.total.toLocaleString()} 条)
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import Pagination, { usePagination } from '@/components/Pagination';
import {
  TrendingUp, CheckCircle, XCircle, Percent,
  ChevronRight, Database, ShieldX,
} from 'lucide-react';
export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    getFilteredLogs, getStats,
  } = useAppStore();
  const logs = getFilteredLogs();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [flashId, setFlashId] = useState<string | null>(null);
  const highlightId = searchParams.get('highlightId');

  // 分页
  const pipelinePage = usePagination(20);

  // 从详情页返回时，滚动并高亮对应行
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`job-row-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(highlightId);
      const timer = window.setTimeout(() => setFlashId(null), 2500);
      const params = new URLSearchParams(searchParams);
      params.delete('highlightId');
      setSearchParams(params, { replace: true });
      return () => window.clearTimeout(timer);
    }
  }, [highlightId, searchParams, setSearchParams]);

  // 切换筛选 tab 时重置分页
  useEffect(() => {
    pipelinePage.onPageChange(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // 按 state_name 统计各筛选类型
  const filterTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(l => {
      if (l.status === 'success') return;
      const sn = l.filterStateName || '其他原因';
      counts[sn] = (counts[sn] || 0) + 1;
    });
    return counts;
  }, [logs]);

  // 按 state_name 筛选
  const filteredLogs = useMemo(() => {
    if (statusFilter === 'all') return logs;
    // success 类型
    if (statusFilter === 'success') return logs.filter(l => l.status === 'success');
    // 具体 state_name
    return logs.filter(l => (l.filterStateName || (l.status !== 'success' ? '其他原因' : '')) === statusFilter);
  }, [logs, statusFilter]);

  // 空数据引导
  if (logs.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[65vh] space-y-5 animate-in">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-warm-400" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-warm-700">暂无数据</h2>
          <p className="text-sm text-warm-400">导入日志数据，开始分析你的投递情况</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="btn btn--primary btn--lg"
        >
          前往导入
        </button>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="w-full space-y-8 animate-in">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <h2 className="font-display text-2xl sm:text-3xl tracking-tight text-warm-900">
          投递总览
        </h2>
      </div>

      {/* 筛选类型 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            statusFilter === 'all' ? 'bg-white text-warm-800 shadow-sm border-warm-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
          }`}
        >
          全部 ({logs.length})
        </button>
        <button
          onClick={() => setStatusFilter('success')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            statusFilter === 'success' ? 'bg-white text-emerald-700 shadow-sm border-emerald-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
          }`}
        >
          投递成功 ({logs.filter(l => l.status === 'success').length})
        </button>
        {Object.entries(filterTypeCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([stateName, count]) => (
            <button
              key={stateName}
              onClick={() => setStatusFilter(statusFilter === stateName ? 'all' : stateName)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                statusFilter === stateName ? 'bg-white text-red-700 shadow-sm border-red-300' : 'bg-warm-50 text-warm-500 border-warm-200 hover:bg-warm-100'
              }`}
            >
              {stateName} ({count})
            </button>
          ))}
      </div>

      {/* ============ 投递日志视图 ============ */}
        <div className="space-y-8">
          {/* Bento 指标卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {/* 总投递 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-1">
              <p className="stat-label">总投递数</p>
              <p className="stat-number text-2xl sm:text-3xl lg:text-4xl">{stats.total}</p>
            </div>

            {/* 投递成功 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-2 border-l-[3px] border-l-emerald-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                <p className="stat-label text-emerald-600">投递成功</p>
              </div>
              <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-emerald-600">{stats.success}</p>
            </div>

            {/* 系统筛选 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-3 border-l-[3px] border-l-amber-400">
              <div className="flex items-center gap-1.5">
                <ShieldX className="w-3 h-3 text-amber-500" />
                <p className="stat-label text-amber-600">系统筛选</p>
              </div>
              <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-amber-600">{stats.screened}</p>
            </div>

            {/* AI 拒绝 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-4 border-l-[3px] border-l-red-400">
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3 h-3 text-red-500" />
                <p className="stat-label text-red-600">AI 评分 &lt;20</p>
              </div>
              <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-red-600">{stats.failed}</p>
            </div>

            {/* 成功率 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-5 border-l-[3px] border-l-accent-400">
              <div className="flex items-center gap-1.5">
                <Percent className="w-3 h-3 text-accent-500" />
                <p className="stat-label text-accent-600">成功率</p>
              </div>
              <p className="stat-number text-2xl sm:text-3xl lg:text-4xl text-accent-500">{stats.successRate}%</p>
            </div>
          </div>

          {/* 投递岗位列表（随筛选 tab 联动） */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              {statusFilter === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-500" strokeWidth={2} />
              ) : statusFilter === 'all' ? (
                <Database className="w-4 h-4 text-accent-500" strokeWidth={2} />
              ) : (
                <ShieldX className="w-4 h-4 text-amber-500" strokeWidth={2} />
              )}
              <h3 className="text-base font-semibold text-warm-800">
                {statusFilter === 'all' ? '投递岗位' : statusFilter === 'success' ? '投递成功岗位' : `${statusFilter}岗位`}
              </h3>
              <span className="text-sm text-warm-400">共 {filteredLogs.length} 个</span>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-100 bg-warm-50/50">
                      <th className="table-header text-left px-5 py-3">时间</th>
                      <th className="table-header text-left px-5 py-3">公司名称</th>
                      <th className="table-header text-left px-5 py-3">岗位名称</th>
                      <th className="table-header text-left px-5 py-3">状态</th>
                      <th className="table-header text-left px-5 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {[...filteredLogs]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .slice(
                        (pipelinePage.page - 1) * pipelinePage.pageSize,
                        pipelinePage.page * pipelinePage.pageSize
                      )
                      .map((log) => (
                      <tr
                        key={log.id}
                        id={`job-row-${log.id}`}
                        className={`table-row cursor-pointer group transition-colors duration-300 ${flashId === log.id ? 'bg-amber-50/80 ring-1 ring-inset ring-amber-200' : ''}`}
                        onClick={() => {
                          const sel = window.getSelection();
                          if (sel && sel.toString().length > 0) return;
                          navigate(`/job/${log.id}?from=dashboard&highlightId=${log.id}`);
                        }}
                      >
                        <td className="table-cell whitespace-nowrap text-warm-500 font-mono text-xs">
                          {new Date(log.timestamp).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-warm-800 font-medium" title={log.companyName}>{log.companyName}</span>
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-warm-600" title={log.jobTitle}>{log.jobTitle}</span>
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${
                            log.status === 'success'
                              ? 'badge--success'
                              : log.status === 'screened'
                                ? 'badge--warning'
                                : log.status === 'failed'
                                  ? 'badge--error'
                                  : 'badge--warning'
                          }`}>
                            {log.filterStateName || (log.status === 'success' ? '投递成功' : '待处理')}
                          </span>
                        </td>
                        <td className="table-cell pr-4">
                          <ChevronRight className="w-3.5 h-3.5 text-warm-300 group-hover:text-accent-500 transition-colors" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...pipelinePage} total={filteredLogs.length} label="条" />
            </div>
          </section>

        </div>
    </div>
  );
}

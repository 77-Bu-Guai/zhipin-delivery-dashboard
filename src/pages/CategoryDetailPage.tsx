import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { groupJobsByCategory, getAllCategories } from '@/utils/jobCategories';
import Pagination, { usePagination } from '@/components/Pagination';
import { ArrowLeft, Tags, ChevronRight } from 'lucide-react';

const STATUS_LABEL: Record<string, { label: string; class: string }> = {
  success: { label: '投递成功', class: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  screened: { label: '系统筛选', class: 'text-red-600 bg-red-50 border-red-200' },
  failed: { label: 'AI评分低于20分', class: 'text-red-600 bg-red-50 border-red-200' },
  pending: { label: '待处理', class: 'text-amber-600 bg-amber-50 border-amber-200' },
};

export default function CategoryDetailPage() {
  const navigate = useNavigate();
  const { category } = useParams<{ category: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getFilteredLogs } = useAppStore();
  const logs = getFilteredLogs();
  const detailPage = usePagination(20);
  const [flashId, setFlashId] = useState<string | null>(null);
  const highlightId = searchParams.get('highlightId');

  const groups = useMemo(() => groupJobsByCategory(logs), [logs]);
  const group = useMemo(() => groups.find(g => g.category === category), [groups, category]);
  const color = useMemo(() => {
    return getAllCategories().find(c => c.category === category)?.color || '#64748b';
  }, [category]);

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

  if (!group) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[65vh] space-y-5 animate-in">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-warm-700">未找到该分类</h2>
          <p className="text-sm text-warm-400">分类「{category}」暂无投递记录或不存在</p>
        </div>
        <button onClick={() => navigate('/categories')} className="btn btn--primary btn--lg">返回岗位分类</button>
      </div>
    );
  }

  const paged = group.jobs.slice(
    (detailPage.page - 1) * detailPage.pageSize,
    detailPage.page * detailPage.pageSize
  );

  return (
    <div className="w-full space-y-6 animate-in">
      {/* 顶部标题栏 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/categories')}
          className="inline-flex items-center gap-1.5 text-sm text-warm-500 hover:text-warm-800 dark:hover:text-warm-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div
          className="w-1.5 h-6 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div className="flex items-center gap-2">
          <Tags className="w-5 h-5" style={{ color }} strokeWidth={2} />
          <h2 className="font-display text-2xl tracking-tight text-warm-900 dark:text-warm-100">
            {group.category}
          </h2>
        </div>
        <span className="text-sm text-warm-400">
          共 <span className="text-warm-700 dark:text-warm-300 font-semibold">{group.count}</span> 个岗位
        </span>
      </div>

      {/* 岗位列表 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-warm-100 bg-warm-50/50 dark:bg-warm-900/40">
                <th className="table-header text-left px-6 py-3 w-28">时间</th>
                <th className="table-header text-left px-6 py-3 w-1/4">公司</th>
                <th className="table-header text-left px-6 py-3 w-1/3">岗位</th>
                <th className="table-header text-left px-6 py-3 w-24">状态</th>
                <th className="table-header text-left px-6 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100 dark:divide-warm-800">
              {paged.map((job) => {
                const statusInfo = STATUS_LABEL[job.status] || STATUS_LABEL.pending;
                return (
                  <tr
                    key={job.id}
                    id={`job-row-${job.id}`}
                    className={`table-row cursor-pointer group transition-colors duration-300 ${flashId === job.id ? 'bg-amber-50/80 ring-1 ring-inset ring-amber-200' : ''}`}
                    onClick={() => {
                      const sel = window.getSelection();
                      if (sel && sel.toString().length > 0) return;
                      navigate(`/job/${job.id}?from=category-detail&category=${encodeURIComponent(group.category)}&highlightId=${job.id}`);
                    }}
                  >
                    <td className="table-cell whitespace-nowrap px-6 py-3">
                      <span className="text-xs text-warm-500 font-mono">
                        {new Date(job.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td className="table-cell px-6 py-3">
                      <span className="text-sm text-warm-800 dark:text-warm-200 font-medium truncate block" title={job.companyName}>{job.companyName}</span>
                    </td>
                    <td className="table-cell px-6 py-3">
                      <span className="text-sm text-warm-600 dark:text-warm-300 truncate block" title={job.jobTitle}>{job.jobTitle}</span>
                    </td>
                    <td className="table-cell px-6 py-3">
                      <span className={`badge whitespace-nowrap ${job.status === 'success' ? 'badge--success' : job.status === 'screened' || job.status === 'failed' ? 'badge--error' : 'badge--warning'}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="table-cell pr-4 px-6 py-3">
                      <ChevronRight className="w-3.5 h-3.5 text-warm-300 group-hover:text-accent-500 transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...detailPage} total={group.jobs.length} label="条" />
      </div>
    </div>
  );
}

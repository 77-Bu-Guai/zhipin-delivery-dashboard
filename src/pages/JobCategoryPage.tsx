import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { groupJobsByCategory, getAllCategories } from '@/utils/jobCategories';
import Pagination, { usePagination } from '@/components/Pagination';
import { Tags, Building2, Briefcase, ChevronRight } from 'lucide-react';

const STATUS_LABEL: Record<string, { label: string; class: string }> = {
  success: { label: '投递成功', class: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  screened: { label: '系统筛选', class: 'text-red-600 bg-red-50 border-red-200' },
  failed: { label: 'AI评分低于20分', class: 'text-red-600 bg-red-50 border-red-200' },
  pending: { label: '待处理', class: 'text-amber-600 bg-amber-50 border-amber-200' },
};

export default function JobCategoryPage() {
  const navigate = useNavigate();
  const { getFilteredLogs } = useAppStore();
  const logs = getFilteredLogs();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const detailPage = usePagination(20);

  if (logs.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[65vh] space-y-5 animate-in">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
          <Tags className="w-8 h-8 text-warm-400" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-warm-700">暂无数据</h2>
          <p className="text-sm text-warm-400">请先导入日志数据</p>
        </div>
        <button onClick={() => navigate('/')} className="btn btn--primary btn--lg">前往导入</button>
      </div>
    );
  }

  const groups = groupJobsByCategory(logs);
  const allCategories = getAllCategories();
  const selectedGroup = groups.find(g => g.category === selectedCategory);

  return (
    <div className="w-full space-y-8 animate-in">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <h2 className="font-display text-3xl tracking-tight text-warm-900">
          岗位分类
        </h2>
        <span className="text-sm text-warm-400">
          共 <span className="text-warm-700 font-semibold">{logs.length}</span> 个岗位
        </span>
      </div>

      {/* 分类卡片网格 */}
      <div className="grid grid-cols-4 gap-4">
        {allCategories.map(({ category, color }, idx) => {
          const group = groups.find(g => g.category === category);
          const count = group?.count ?? 0;
          const isSelected = selectedCategory === category;

          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(isSelected ? null : category)}
              className={`card p-5 text-left transition-all duration-300 group animate-in animate-in--delay-${Math.min(idx + 1, 5)} ${
                isSelected
                  ? 'shadow-md ring-2 ring-accent-200'
                  : 'card--hover'
              }`}
            >
              {/* 顶部色条 */}
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ backgroundColor: color }} />

              <div className="relative mt-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-warm-800">{category}</span>
                  <span
                    className="text-2xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}35` }}
                  >
                    {count}
                  </span>
                </div>

                {group && group.jobs.length > 0 ? (
                  <div className="space-y-1.5">
                    {group.jobs.slice(0, 2).map(job => (
                      <div key={job.id} className="flex items-center gap-2 text-xs text-warm-500 truncate">
                        <Building2 className="w-3 h-3 flex-shrink-0 text-warm-400" />
                        <span className="truncate">{job.companyName}</span>
                        <span className="text-warm-300">·</span>
                        <span className="truncate">{job.jobTitle}</span>
                      </div>
                    ))}
                    {group.jobs.length > 2 && (
                      <p className="text-2xs text-warm-400">+{group.jobs.length - 2} 更多</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-warm-400 mt-1">暂未投递此类岗位</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 展开详情表格 */}
      {selectedGroup && selectedGroup.jobs.length > 0 && (() => {
        const paged = selectedGroup.jobs.slice(
          (detailPage.page - 1) * detailPage.pageSize,
          detailPage.page * detailPage.pageSize
        );
        return (
        <section className="space-y-4 animate-in">
          <div className="flex items-center gap-2">
            <Tags className="w-4.5 h-4.5" style={{ color: selectedGroup.color }} strokeWidth={2} />
            <h3 className="text-base font-semibold text-warm-800">{selectedGroup.category}</h3>
            <span className="text-sm text-warm-400">— {selectedGroup.count} 个岗位</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-warm-100 bg-warm-50/50">
                    <th className="table-header text-left px-6 py-3">时间</th>
                    <th className="table-header text-left px-6 py-3">公司</th>
                    <th className="table-header text-left px-6 py-3">岗位</th>
                    <th className="table-header text-left px-6 py-3">状态</th>
                    <th className="table-header text-left px-6 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-100">
                  {paged.map((job) => {
                    const statusInfo = STATUS_LABEL[job.status] || STATUS_LABEL.pending;
                    return (
                      <tr
                        key={job.id}
                        className="table-row cursor-pointer group"
                        onClick={() => navigate(`/job/${job.id}`)}
                      >
                        <td className="table-cell whitespace-nowrap">
                          <span className="text-xs text-warm-500 font-mono">
                            {new Date(job.timestamp).toLocaleString('zh-CN', {
                              month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-warm-800 font-medium">{job.companyName}</span>
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-warm-600">{job.jobTitle}</span>
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${job.status === 'success' ? 'badge--success' : job.status === 'screened' || job.status === 'failed' ? 'badge--error' : 'badge--warning'}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="table-cell pr-4">
                          <ChevronRight className="w-3.5 h-3.5 text-warm-300 group-hover:text-accent-500 transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...detailPage} total={selectedGroup.jobs.length} label="条" />
          </div>
        </section>
        );
      })()}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { parseAiScoreForDisplay } from '@/utils/aiScoringParser';
import Pagination, { usePagination } from '@/components/Pagination';
import {
  TrendingUp, CheckCircle, XCircle, Percent,
  ChevronRight, Database, ShieldX,
  FileText, BarChart3, AlertTriangle, Brain,
  ArrowUpRight, Flame,
} from 'lucide-react';

type DataTab = 'pipeline' | 'web';

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    getFilteredLogs, getStats, getSuccessLogs,
    deductionCategories,
    hasPipelineData, hasWebStatsData,
  } = useAppStore();
  const logs = getFilteredLogs();

  const [activeTab, setActiveTab] = useState<DataTab>('pipeline');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 分页
  const pipelinePage = usePagination(20);
  const aiScoringPage = usePagination(20);

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
  if (logs.length === 0 && !hasWebStatsData()) {
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

  const hasPipeline = hasPipelineData();
  const hasWeb = hasWebStatsData();

  const stats = getStats();
  const successLogs = getSuccessLogs();

  return (
    <div className="w-full space-y-8 animate-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-3xl tracking-tight text-warm-900">
            投递总览
          </h2>
          {/* 数据源标签 */}
          <span className="badge badge--neutral text-2xs">
            {activeTab === 'pipeline' ? '' : ''}
          </span>
        </div>

        {/* 选项卡 */}
        <div className="flex rounded-lg bg-warm-50 border border-warm-200 p-0.5">
          <button
            onClick={() => setActiveTab('pipeline')}
            disabled={!hasPipeline}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === 'pipeline'
                ? 'bg-white text-warm-800 shadow-sm border border-warm-200/80'
                : 'text-warm-400 hover:text-warm-600'
            } ${!hasPipeline ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <FileText className="w-3.5 h-3.5" />
            投递日志
          </button>
          <button
            onClick={() => setActiveTab('web')}
            disabled={!hasWeb}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === 'web'
                ? 'bg-white text-warm-800 shadow-sm border border-warm-200/80'
                : 'text-warm-400 hover:text-warm-600'
            } ${!hasWeb ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            AI 评分
          </button>
        </div>
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

      {/* ============ 旧日志数据视图 ============ */}
      {activeTab === 'pipeline' && (
        <div className="space-y-8">
          {/* Bento 指标卡片 */}
          <div className="grid grid-cols-5 gap-4">
            {/* 总投递 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-1">
              <p className="stat-label">总投递数</p>
              <p className="stat-number">{stats.total}</p>
            </div>

            {/* 投递成功 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-2 border-l-[3px] border-l-emerald-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                <p className="stat-label text-emerald-600">投递成功</p>
              </div>
              <p className="stat-number text-emerald-600">{stats.success}</p>
            </div>

            {/* 系统筛选 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-3 border-l-[3px] border-l-amber-400">
              <div className="flex items-center gap-1.5">
                <ShieldX className="w-3 h-3 text-amber-500" />
                <p className="stat-label text-amber-600">系统筛选</p>
              </div>
              <p className="stat-number text-amber-600">{stats.screened}</p>
            </div>

            {/* AI 拒绝 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-4 border-l-[3px] border-l-red-400">
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3 h-3 text-red-500" />
                <p className="stat-label text-red-600">AI 评分 &lt;20</p>
              </div>
              <p className="stat-number text-red-600">{stats.failed}</p>
            </div>

            {/* 成功率 */}
            <div className="card p-5 col-span-1 space-y-1 animate-in animate-in--delay-5 border-l-[3px] border-l-accent-400">
              <div className="flex items-center gap-1.5">
                <Percent className="w-3 h-3 text-accent-500" />
                <p className="stat-label text-accent-600">成功率</p>
              </div>
              <p className="stat-number text-accent-500">{stats.successRate}%</p>
            </div>
          </div>

          {/* 成功投递列表 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" strokeWidth={2} />
              <h3 className="text-base font-semibold text-warm-800">
                投递成功岗位
              </h3>
              <span className="text-sm text-warm-400">共 {successLogs.length} 个</span>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-100 bg-warm-50/50">
                      <th className="table-header text-left px-5 py-3">时间</th>
                      <th className="table-header text-left px-5 py-3">公司名称</th>
                      <th className="table-header text-left px-5 py-3">岗位名称</th>
                      <th className="table-header text-left px-5 py-3">浏览器</th>
                      <th className="table-header text-left px-5 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {successLogs
                      .slice(
                        (pipelinePage.page - 1) * pipelinePage.pageSize,
                        pipelinePage.page * pipelinePage.pageSize
                      )
                      .map((log) => (
                      <tr
                        key={log.id}
                        className="table-row cursor-pointer group"
                        onClick={() => navigate(`/job/${log.id}`)}
                      >
                        <td className="table-cell whitespace-nowrap text-warm-500 font-mono text-xs">
                          {new Date(log.timestamp).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-warm-800 font-medium">{log.companyName}</span>
                        </td>
                        <td className="table-cell">
                          <span className="text-sm text-warm-600">{log.jobTitle}</span>
                        </td>
                        <td className="table-cell">
                          <span className="badge badge--neutral">
                            {log.browser === 'chrome' ? 'Chrome' : log.browser === 'firefox' ? 'Firefox' : '-'}
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
              <Pagination {...pipelinePage} total={successLogs.length} label="条" />
            </div>
          </section>
        </div>
      )}

      {/* ============ 网页前端数据视图 ============ */}
      {activeTab === 'web' && (
        <div className="space-y-8">
          {deductionCategories.length > 0 && (
            <>
              {/* AI 评分概况 */}
              <section className="space-y-4 animate-in animate-in--delay-1">
                <div className="flex items-center gap-2">
                  <Brain className="w-4.5 h-4.5 text-accent-500" strokeWidth={2} />
                  <h3 className="text-base font-semibold text-warm-800">AI 评分概况</h3>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  {(() => {
                    const totalWithAi = filteredLogs.filter(l => l.aiScoring?.message?.includes('分数')).length;
                    const totalDeductions = deductionCategories.reduce((s, c) => s + c.count, 0);
                    const topCat = [...deductionCategories].sort((a, b) => b.count - a.count)[0];
                    return [
                      { label: '已评分岗位', value: totalWithAi, accent: 'text-accent-600' },
                      { label: '总扣分次数', value: totalDeductions, accent: 'text-red-600' },
                      { label: '扣分类别数', value: deductionCategories.length, accent: 'text-amber-600' },
                      { label: '最高频扣分', value: topCat?.category || '-', accent: 'text-warm-600', small: true },
                    ];
                  })().map((item, i) => (
                    <div key={item.label} className={`card p-5 space-y-1 animate-in animate-in--delay-${i + 2}`}>
                      <p className="stat-label">{item.label}</p>
                      <p className={`font-display text-3xl tracking-tight ${item.accent} ${item.small ? 'text-lg leading-tight' : ''}`}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* AI 扣分类别分布 */}
              <section className="space-y-4 animate-in animate-in--delay-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-500" strokeWidth={2} />
                  <h3 className="text-base font-semibold text-warm-800">
                    AI 扣分类别分布
                  </h3>
                  <span className="text-sm text-warm-400">共 {deductionCategories.length} 类</span>
                </div>

                <div className="card overflow-hidden divide-y divide-warm-100">
                  {deductionCategories.map((cat) => (
                    <div
                      key={cat.category}
                      className="px-5 py-4 hover:bg-warm-50 transition-colors cursor-pointer group"
                      onClick={() => navigate('/deductions')}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-semibold text-warm-800">{cat.category}</span>
                          <span className="badge badge--error text-2xs">{cat.count} 次</span>
                          <span className="text-xs text-warm-400">共 {cat.totalScore} 分</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-warm-500">{cat.percentage}%</span>
                          <ArrowUpRight className="w-3 h-3 text-warm-300 group-hover:text-accent-500 transition-colors" />
                        </div>
                      </div>

                      {/* 占比条 */}
                      <div className="w-full h-1.5 rounded-full bg-warm-100 overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${cat.percentage}%`,
                            background: 'linear-gradient(90deg, #d9704a, #e5835c)',
                          }}
                        />
                      </div>

                      {/* 示例标签 */}
                      {cat.examples.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {cat.examples.map((ex, i) => (
                            <span key={i} className="text-2xs px-2 py-0.5 rounded-md bg-warm-50 text-warm-500 border border-warm-200">
                              {ex}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* AI 评分明细 */}
          {filteredLogs.filter(l => l.aiScoring?.message?.includes('分数')).length > 0 && (
            <section className="space-y-4 animate-in animate-in--delay-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-accent-500" strokeWidth={2} />
                <h3 className="text-base font-semibold text-warm-800">AI 评分明细</h3>
                <span className="text-sm text-warm-400">
                  共 {filteredLogs.filter(l => l.aiScoring?.message?.includes('分数')).length} 条
                </span>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-warm-100 bg-warm-50/50">
                        <th className="table-header text-left px-5 py-3">时间</th>
                        <th className="table-header text-left px-5 py-3">公司</th>
                        <th className="table-header text-left px-5 py-3">岗位</th>
                        <th className="table-header text-left px-5 py-3">评分</th>
                        <th className="table-header text-left px-5 py-3">筛选原因</th>
                        <th className="table-header text-left px-5 py-3">状态</th>
                        <th className="table-header text-left px-5 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-100">
                       {filteredLogs
                        .filter(l => l.aiScoring?.message?.includes('分数'))
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .slice(
                          (aiScoringPage.page - 1) * aiScoringPage.pageSize,
                          aiScoringPage.page * aiScoringPage.pageSize
                        )
                        .map((log) => {
                          const aiDisplay = parseAiScoreForDisplay(log.aiScoring!.message);

                          return (
                            <tr
                              key={log.id}
                              className="table-row cursor-pointer group"
                              onClick={() => navigate(`/job/${log.id}`)}
                            >
                              <td className="table-cell whitespace-nowrap">
                                <span className="text-xs text-warm-500 font-mono">
                                  {new Date(log.timestamp).toLocaleString('zh-CN', {
                                    month: '2-digit', day: '2-digit',
                                  })}
                                </span>
                              </td>
                              <td className="table-cell">
                                <span className="text-sm text-warm-800 font-medium">{log.companyName}</span>
                              </td>
                              <td className="table-cell">
                                <span className="text-sm text-warm-600">{log.jobTitle}</span>
                              </td>
                              <td className="table-cell min-w-[240px] max-w-[360px]">
                                {aiDisplay ? (
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${aiDisplay.grade.bgClass} ${aiDisplay.grade.textClass} border ${aiDisplay.grade.borderClass}`}>
                                        {aiDisplay.grade.label}
                                      </span>
                                      <span className={`text-xs font-bold font-mono tabular-nums ${
                                        aiDisplay.totalScore >= 0 ? 'text-emerald-600' : 'text-red-600'
                                      }`}>
                                        {aiDisplay.totalScore >= 0 ? '+' : ''}{aiDisplay.totalScore}
                                      </span>
                                      {aiDisplay.hasFatal && (
                                        <span className="text-2xs text-red-500 flex items-center gap-0.5">
                                          <Flame className="w-3 h-3" />
                                          致命
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {aiDisplay.deductions.slice(0, 3).map((d, i) => (
                                        <span
                                          key={i}
                                          className={`text-2xs px-1.5 py-0.5 rounded leading-tight ${
                                            d.points >= 1000
                                              ? 'bg-red-100 text-red-700 border border-red-200'
                                              : 'bg-red-50 text-red-600 border border-red-100'
                                          }`}
                                        >
                                          {d.reason}
                                          <span className="ml-0.5 opacity-70">{d.points}分</span>
                                        </span>
                                      ))}
                                      {aiDisplay.deductions.length > 3 && (
                                        <span className="text-2xs text-warm-400 px-1">+{aiDisplay.deductions.length - 3}项</span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-warm-400">-</span>
                                )}
                              </td>
                              <td className="table-cell">
                                <span className={`badge ${log.status === 'success' ? 'badge--success' : 'badge--error'}`}>
                                  {log.status === 'success' ? '已投递' : '筛选'}
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
                <Pagination {...aiScoringPage} total={filteredLogs.filter(l => l.aiScoring?.message?.includes('分数')).length} label="条" />
              </div>
            </section>
          )}

          {!hasWeb && (
            <div className="text-center py-16 space-y-3">
              <BarChart3 className="w-10 h-10 mx-auto text-warm-300" strokeWidth={1.5} />
              <p className="text-warm-500 text-sm">暂无 AI 评分数据</p>
              <p className="text-xs text-warm-400">导出数据时需包含 AI 评分日志</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

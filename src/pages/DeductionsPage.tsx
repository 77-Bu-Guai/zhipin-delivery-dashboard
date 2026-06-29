import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { parseAiDeductionsFromLogs } from '@/utils/dataLoader';
import { AlertTriangle, BarChart3, TrendingUp, Filter, Target, Activity, ChevronDown, ChevronRight, Search, X, Building2, Briefcase } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const chartColors = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6',
  '#84cc16', '#d946ef', '#0ea5e9', '#f59e0b', '#64748b',
];

export default function DeductionsPage() {
  const navigate = useNavigate();
  const { logs } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 解析 AI 评分扣分项
  const aiDeductions = useMemo(() => {
    return parseAiDeductionsFromLogs(logs);
  }, [logs]);

  // 筛选后的扣分项
  const filtered = useMemo(() => {
    if (!searchTerm) return aiDeductions;
    return aiDeductions.filter(d =>
      d.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [aiDeductions, searchTerm]);

  // 选中分类下的受影响岗位
  const selectedJobs = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = aiDeductions.find(d => d.category === selectedCategory);
    if (!cat) return [];
    return cat.affectedLogIds
      .map(id => logs.find(l => l.id === id))
      .filter(Boolean)
      .slice(0, 50);
  }, [selectedCategory, aiDeductions, logs]);

  // 统计汇总
  const stats = useMemo(() => {
    const totalDeductions = aiDeductions.reduce((s, d) => s + d.count, 0);
    const scoredLogs = logs.filter(l => l.aiScoring?.message?.includes('分数')).length;
    const avgPerPost = scoredLogs > 0 ? (totalDeductions / scoredLogs).toFixed(1) : '0';
    return {
      scoredLogs,
      totalDeductions,
      categories: aiDeductions.length,
      avgPerPost,
    };
  }, [aiDeductions, logs]);

  if (logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-white">暂无数据</h2>
        <p className="text-slate-400">请先导入日志数据</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/25"
        >
          前往导入
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* 页面标题 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            AI 评分扣分分析
          </h2>
          <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            来自 AI 评分日志
          </span>
        </div>
        <p className="text-slate-400">
          解析 {stats.scoredLogs} 条 AI 评分记录，共 {stats.totalDeductions} 次扣分，{stats.categories} 种类型
        </p>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-white">{stats.scoredLogs}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Target className="w-3 h-3" /> 已评分岗位
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-red-500/20 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-red-400">{stats.totalDeductions}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-red-400" /> 总扣分次数
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-purple-500/20 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-purple-400">{stats.categories}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <BarChart3 className="w-3 h-3 text-purple-400" /> 扣分类别
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-amber-500/20 p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-amber-400">{stats.avgPerPost}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Activity className="w-3 h-3 text-amber-400" /> 平均每岗位扣分项
            </div>
          </div>
        </div>
      </div>

      {/* 如果还没有评分数据 */}
      {aiDeductions.length === 0 && stats.scoredLogs === 0 && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-12 text-center">
          <TrendingUp className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">暂无 AI 评分数据</h3>
          <p className="text-slate-400">请先在导入页加载数据，或运行导出脚本后刷新</p>
        </div>
      )}

      {/* AI 评分扣分项分析 */}
      {aiDeductions.length > 0 && (
        <div className="grid grid-cols-5 gap-6">
          {/* 柱状图 */}
          <div className="col-span-3 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              扣分项分类统计（按次数降序）
            </h3>
            <ResponsiveContainer width="100%" height={Math.max(300, filtered.length * 48)}>
              <BarChart
                data={filtered}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 13 }}
                  width={110}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#e2e8f0', fontSize: '13px' }}
                  cursor={{ fill: 'rgba(6, 182, 212, 0.1)' }}
                  formatter={(_value: number, _name: string, props: { payload: { category: string; count: number; percentage: number; totalScore: number } }) => [
                    `${props.payload.count} 次 (${props.payload.percentage}%) | 共扣 ${props.payload.totalScore} 分`,
                    props.payload.category
                  ]}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={28}>
                  {filtered.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 详情列表 */}
          <div className="col-span-2 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">扣分类别</h3>

            {/* 搜索框 */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="搜索扣分类别..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSelectedCategory(null); }}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto">
              {filtered.map((cat, index) => {
                const isSelected = selectedCategory === cat.category;
                return (
                  <div key={cat.category}>
                    <button
                      onClick={() => setSelectedCategory(isSelected ? null : cat.category)}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-cyan-500/40 bg-cyan-500/5'
                          : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                          <span className="text-sm font-medium text-white truncate">{cat.category}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-slate-200">{cat.count} 次</span>
                          {isSelected ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cat.percentage}%`, backgroundColor: chartColors[index % chartColors.length] }} />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-slate-500">占比 {cat.percentage}%</span>
                        <span className="text-xs text-red-400">扣 {cat.totalScore} 分</span>
                      </div>
                    </button>

                    {/* 展开详情 */}
                    {isSelected && cat.examples.length > 0 && (
                      <div className="mx-2 mb-2 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 space-y-2">
                        <p className="text-xs font-medium text-slate-400 mb-1">扣分原因示例：</p>
                        {cat.examples.map((ex, i) => (
                          <div key={i} className="text-xs text-slate-300 bg-slate-900/50 rounded-lg px-3 py-2 leading-relaxed">
                            {ex}
                          </div>
                        ))}
                        <p className="text-xs text-slate-500 mt-1">
                          共 {cat.affectedLogIds.length} 个岗位被此规则扣分
                        </p>
                      </div>
                    )}

                    {/* 受影响岗位列表 */}
                    {isSelected && selectedJobs.length > 0 && (
                      <div className="mx-2 mb-3 rounded-xl bg-slate-800/50 border border-slate-700/30 overflow-hidden">
                        <div className="px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-700/30">
                          被「{cat.category}」筛选的岗位
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800">
                          {selectedJobs.map((job) => job && (
                            <button
                              key={job.id}
                              onClick={() => navigate(`/job/${job.id}`)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700/30 transition-colors text-left"
                            >
                              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs text-white truncate">{job.companyName}</div>
                                <div className="text-[11px] text-slate-500 truncate">{job.jobTitle}</div>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                                job.status === 'screened'
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : job.status === 'failed'
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : job.status === 'success'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              }`}>
                                {job.status === 'screened' ? '被筛选' : job.status === 'failed' ? '投递失败' : job.status === 'success' ? '投递成功' : '待处理'}
                              </span>
                              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 全量表 */}
      {aiDeductions.length > 0 && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-cyan-400" />
              全量扣分明细
              <span className="text-sm font-normal text-slate-400">（共 {aiDeductions.reduce((s, d) => s + d.affectedLogIds.length, 0)} 个岗位受影响）</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left bg-slate-900/80">
                  <th className="px-4 py-3 text-slate-400 font-medium">分类</th>
                  <th className="px-4 py-3 text-slate-400 font-medium text-right">次数</th>
                  <th className="px-4 py-3 text-slate-400 font-medium text-right">总扣分</th>
                  <th className="px-4 py-3 text-slate-400 font-medium text-right">占比</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">示例</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {aiDeductions.map((cat, idx) => (
                  <tr key={cat.category} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[idx % chartColors.length] }} />
                        <span className="text-white font-medium">{cat.category}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-right font-medium">{cat.count} 次</td>
                    <td className="px-4 py-3 text-red-400 text-right font-mono">{cat.totalScore} 分</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        cat.percentage > 20 ? 'bg-red-500/10 text-red-400' :
                        cat.percentage > 5 ? 'bg-amber-500/10 text-amber-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {cat.percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{cat.examples[0] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

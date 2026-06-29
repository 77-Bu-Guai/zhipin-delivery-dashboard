import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { TrendingUp, CheckCircle, XCircle, Percent, ChevronRight, Building2, Briefcase, Database, ShieldX } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { getStats, getSuccessLogs, logs, hasRealData } = useAppStore();

  // 如果还没有加载数据，引导回导入页
  if (logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center">
          <TrendingUp className="w-10 h-10 text-slate-500" />
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

  const stats = getStats();
  const successLogs = getSuccessLogs();

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* 页面标题 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
            投递总览
          </h2>
          {hasRealData && (
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Database className="w-3 h-3" />
              真实插件数据
            </span>
          )}
        </div>
        <p className="text-slate-400">关键指标与成功投递岗位一览</p>
      </div>

      {/* 指标卡片 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 p-5 group hover:border-cyan-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-slate-400 mt-1">总投递数</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-emerald-500/20 p-5 group hover:border-emerald-500/40 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-emerald-400">{stats.success}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400" /> 投递成功
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-red-500/20 p-5 group hover:border-red-500/40 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-red-400">{stats.screened}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <ShieldX className="w-3 h-3 text-red-400" /> 被AI筛选
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-red-500/20 p-5 group hover:border-red-500/40 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-red-400">{stats.failed}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" /> 投递失败
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-cyan-500/20 p-5 group hover:border-cyan-500/40 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-bl-full" />
          <div className="relative">
            <div className="text-3xl font-bold text-cyan-400">{stats.successRate}%</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Percent className="w-3 h-3 text-cyan-400" /> 成功率
            </div>
          </div>
        </div>
      </div>

      {/* 成功投递列表 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          投递成功岗位
          <span className="text-sm font-normal text-slate-400">（共 {successLogs.length} 个）</span>
        </h3>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left">
                  <th className="px-6 py-4 text-slate-400 font-medium">时间</th>
                  <th className="px-6 py-4 text-slate-400 font-medium">公司名称</th>
                  <th className="px-6 py-4 text-slate-400 font-medium">岗位名称</th>
                  <th className="px-6 py-4 text-slate-400 font-medium">浏览器</th>
                  <th className="px-6 py-4 text-slate-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {successLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    onClick={() => navigate(`/job/${log.id}`)}
                  >
                    <td className="px-6 py-4 text-slate-300 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-500" />
                        <span className="text-white font-medium">{log.companyName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-200">{log.jobTitle}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-400">
                        {log.browser === 'chrome' ? 'Chrome' : log.browser === 'firefox' ? 'Firefox' : '浏览器'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 text-cyan-400 text-xs group-hover:underline">
                        查看详情
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
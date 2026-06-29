import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chrome, Globe, Upload, CheckCircle, Clock, XCircle, FileText, Calendar, Database, RefreshCw, Terminal } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export default function ImportPage() {
  const navigate = useNavigate();
  const { loadLogs, refreshData, logs, isLoading, clearLogs, hasRealData, dataSources } = useAppStore();
  const [loaded, setLoaded] = useState(false);
  const [selectedBrowser, setSelectedBrowser] = useState<'chrome' | 'firefox'>('chrome');

  const handleLoad = async () => {
    try {
      console.log('🔄 开始加载数据...', selectedBrowser);
      await loadLogs(selectedBrowser);
      setLoaded(true);
      console.log('✅ 加载完成');
    } catch (err) {
      console.error('❌ 加载失败:', err);
    }
  };

  const handleRefresh = async () => {
    await refreshData();
  };

  const handleReset = () => {
    clearLogs();
    setLoaded(false);
  };

  const successCount = logs.filter((l) => l.status === 'success').length;
  const screenedCount = logs.filter((l) => l.status === 'screened').length;
  const failedCount = logs.filter((l) => l.status === 'failed').length;
  const pendingCount = logs.filter((l) => l.status === 'pending').length;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 调试状态栏 */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-4 text-xs text-amber-300 font-mono">
        <span>版本: {new Date().toISOString().slice(11, 19)}</span>
        <span>|</span>
        <span>加载中: {isLoading ? '✅' : '❌'}</span>
        <span>|</span>
        <span>日志数: {logs.length}</span>
        <span>|</span>
        <span>真实数据: {hasRealData ? '✅' : '❌'}</span>
        <span>|</span>
        <span>Chrome: {dataSources.chrome ? '✅' : '❌'}</span>
        <span>|</span>
        <span>Firefox: {dataSources.firefox ? '✅' : '❌'}</span>
      </div>

      {/* 页面标题 */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Upload className="w-6 h-6 text-cyan-400" />
          数据导入
        </h2>
        <p className="text-slate-400">从 Chrome / Firefox 浏览器插件加载 Boss 直聘自动投递日志</p>
      </div>

      {/* 数据来源状态 */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          数据来源
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${dataSources.chrome ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dataSources.chrome ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 'bg-slate-700'}`}>
              <Chrome className={`w-5 h-5 ${dataSources.chrome ? 'text-white' : 'text-slate-500'}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-white flex items-center gap-2">
                Google Chrome
                {dataSources.chrome && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
              <div className="text-xs text-slate-400">
                {dataSources.chrome ? '数据已连接' : '等待导出'}
              </div>
            </div>
          </div>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${dataSources.firefox ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dataSources.firefox ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-slate-700'}`}>
              <Globe className={`w-5 h-5 ${dataSources.firefox ? 'text-white' : 'text-slate-500'}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-white flex items-center gap-2">
                Mozilla Firefox
                {dataSources.firefox && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
              <div className="text-xs text-slate-400">
                {dataSources.firefox ? '数据已连接' : '等待导出'}
              </div>
            </div>
          </div>
        </div>

        {/* 导出命令提示 */}
        {!hasRealData && !isLoading && !loaded && (
          <div className="mt-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-start gap-3">
            <Terminal className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm text-amber-300 font-medium mb-1">需要先导出浏览器数据</div>
              <div className="text-xs text-slate-400 mb-2">在终端中运行以下命令，将浏览器插件日志导出到文件：</div>
              <code className="block text-xs bg-slate-950 text-cyan-300 px-3 py-2 rounded-lg font-mono">
                npm run export-data
              </code>
              <div className="text-xs text-slate-500 mt-2">导出后回到此页面点击"加载日志"即可</div>
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="space-y-4">
        {/* 浏览器选择 */}
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedBrowser('chrome')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              selectedBrowser === 'chrome'
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : 'border border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            <Chrome className="w-4 h-4" />
            Google Chrome
            {dataSources.chrome && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
          </button>
          <button
            onClick={() => setSelectedBrowser('firefox')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              selectedBrowser === 'firefox'
                ? 'bg-gradient-to-r from-orange-500/20 to-red-500/10 text-orange-300 border border-orange-500/30'
                : 'border border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            <Globe className="w-4 h-4" />
            Mozilla Firefox
            {dataSources.firefox && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleLoad}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/25"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                正在加载日志...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {loaded ? '重新加载日志' : '加载日志数据'}
              </>
            )}
          </button>
          {loaded && hasRealData && (
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-cyan-500/30 text-cyan-300 text-sm font-medium hover:bg-cyan-500/10 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              刷新数据
            </button>
          )}
          {logs.length > 0 && (
            <button
              onClick={handleReset}
              className="px-6 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-all"
            >
              清除数据
            </button>
          )}
        </div>
      </div>

      {/* 日志预览 */}
      {logs.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                日志预览
              </h3>
              {hasRealData && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  真实数据
                </span>
              )}
              {!hasRealData && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  模拟数据
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/25"
            >
              进入分析面板
            </button>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-5 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/50">
              <div className="text-2xl font-bold text-white">{logs.length}</div>
              <div className="text-xs text-slate-400 mt-1">总投递数</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/20">
              <div className="text-2xl font-bold text-emerald-400">{successCount}</div>
              <div className="text-xs text-slate-400 mt-1">投递成功</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-red-500/20">
              <div className="text-2xl font-bold text-red-400">{screenedCount}</div>
              <div className="text-xs text-slate-400 mt-1">被AI筛选</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-red-500/20">
              <div className="text-2xl font-bold text-red-400">{failedCount}</div>
              <div className="text-xs text-slate-400 mt-1">投递失败</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/20">
              <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
              <div className="text-xs text-slate-400 mt-1">待处理</div>
            </div>
          </div>

          {/* 日志列表 */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm">
                  <tr className="text-left text-slate-400">
                    <th className="px-4 py-3 font-medium">时间</th>
                    <th className="px-4 py-3 font-medium">公司</th>
                    <th className="px-4 py-3 font-medium">岗位</th>
                    <th className="px-4 py-3 font-medium">来源</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">筛选结果</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {new Date(log.timestamp).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-200">{log.companyName}</td>
                      <td className="px-4 py-2.5 text-slate-300">{log.jobTitle}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                          {log.browser === 'chrome' ? 'Chrome' : log.browser === 'firefox' ? 'Firefox' : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5" /> 成功
                          </span>
                        ) : log.status === 'screened' ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="w-3.5 h-3.5" /> 被筛选
                          </span>
                        ) : log.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="w-3.5 h-3.5" /> 失败
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Clock className="w-3.5 h-3.5" /> 待处理
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          log.status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : log.status === 'screened' || log.status === 'failed'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {log.message || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
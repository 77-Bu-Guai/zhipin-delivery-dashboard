import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { FileDown, Calendar, Download, Filter, RefreshCw, TrendingUp } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function ExportPage() {
  const navigate = useNavigate();
  const { getFilteredLogs, setFilterOptions, filterOptions, logs } = useAppStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const handleApplyFilter = () => {
    if (startDate && endDate) {
      setFilterOptions({
        dateRange: [new Date(startDate), new Date(endDate)],
      });
    } else {
      setFilterOptions({ dateRange: null });
    }
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setFilterOptions({ dateRange: null });
  };

  const filteredLogs = getFilteredLogs();

  const handleExportPDF = async () => {
    if (!exportRef.current || filteredLogs.length === 0) return;
    setIsGenerating(true);

    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

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

  if (logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center">
          <FileDown className="w-10 h-10 text-slate-500" />
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
    <div className="max-w-5xl mx-auto space-y-8">
      {/* 页面标题 */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileDown className="w-6 h-6 text-cyan-400" />
          导出报告
        </h2>
        <p className="text-slate-400">按日期时间筛选投递记录，导出 PDF 报告</p>
      </div>

      {/* 筛选器 */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Filter className="w-5 h-5 text-cyan-400" />
          日期筛选
        </h3>
        <div className="flex items-end gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> 开始日期
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> 结束日期
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <button
            onClick={handleApplyFilter}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/25"
          >
            应用筛选
          </button>
          <button
            onClick={handleClearFilter}
            className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 transition-all flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            清除
          </button>
        </div>
      </div>

      {/* 预览区域 */}
      <div ref={exportRef} className="rounded-2xl border border-slate-700/50 bg-slate-900/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Boss 直聘投递报告
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                生成时间：{new Date().toLocaleString('zh-CN')}
                {filterOptions.dateRange && (
                  <span className="ml-3">
                    筛选范围：{new Date(filterOptions.dateRange[0]).toLocaleDateString('zh-CN')} - {new Date(filterOptions.dateRange[1]).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-cyan-400">{filteredLogs.length}</div>
              <div className="text-xs text-slate-400">投递记录</div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-left bg-slate-900/80">
                <th className="px-6 py-3 text-slate-400 font-medium">序号</th>
                <th className="px-6 py-3 text-slate-400 font-medium">投递时间</th>
                <th className="px-6 py-3 text-slate-400 font-medium">公司名称</th>
                <th className="px-6 py-3 text-slate-400 font-medium">岗位名称</th>
                <th className="px-6 py-3 text-slate-400 font-medium">状态</th>
                <th className="px-6 py-3 text-slate-400 font-medium">浏览器</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    当前筛选条件下无投递记录
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-6 py-3 text-slate-300 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-3 text-white font-medium">{log.companyName}</td>
                    <td className="px-6 py-3 text-slate-200">{log.jobTitle}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        log.status === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : log.status === 'screened'
                          ? 'bg-red-500/10 text-red-400'
                          : log.status === 'failed'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {log.status === 'success' ? '成功' : log.status === 'screened' ? '被筛选' : log.status === 'failed' ? '失败' : '待处理'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {log.browser === 'chrome' ? 'Chrome' : log.browser === 'firefox' ? 'Firefox' : '浏览器'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 下载按钮 */}
      <div className="flex justify-center">
        <button
          onClick={handleExportPDF}
          disabled={isGenerating || filteredLogs.length === 0}
          className="group relative flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-base hover:from-cyan-400 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              正在生成 PDF...
            </>
          ) : (
            <>
              <Download className="w-5 h-5 group-hover:animate-bounce" />
              下载 PDF 报告
              <span className="text-xs opacity-75">({filteredLogs.length} 条记录)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
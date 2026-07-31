import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import AIChat from '@/components/AIChat';

export default function AssistantPage() {
  const { getFilteredLogs } = useAppStore();
  const logs = getFilteredLogs();

  return (
    <div className="w-full h-full flex flex-col animate-in">
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-500/20">
          <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <div>
          <h2 className="font-display text-2xl tracking-tight text-warm-900 dark:text-warm-100">
            智能助手
          </h2>
          <p className="text-sm text-warm-400 dark:text-warm-500">
            基于当前 {logs.length} 条投递记录，随时提问分析
          </p>
        </div>
      </div>

      {/* 对话区自适应撑满剩余高度 */}
      <div className="flex-1 min-h-0">
        <AIChat logs={logs} standalone />
      </div>
    </div>
  );
}

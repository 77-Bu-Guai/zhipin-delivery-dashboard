import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { parseAiScoreMessage, getScoreGrade } from '@/utils/aiScoringParser';
import {
  ArrowLeft, Building2, Briefcase, Calendar, Globe,
  CheckCircle2, XCircle, Star, Award, Zap, ThumbsUp,
  TrendingUp, TrendingDown, Minus, Plus,
} from 'lucide-react';

const categoryIcons: Record<string, React.ReactNode> = {
  '技能匹配': <Zap className="w-4 h-4" />,
  '学历优势': <Award className="w-4 h-4" />,
  '经验优势': <Star className="w-4 h-4" />,
  '软技能': <ThumbsUp className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  '技能匹配': 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  '学历优势': 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  '经验优势': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  '软技能': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getLogById = useAppStore((s) => s.getLogById);

  const log = id ? getLogById(id) : undefined;

  // 解析 AI 评分
  const aiScore = log?.aiScoring?.message ? parseAiScoreMessage(log.aiScoring.message) : null;
  const scoreGrade = aiScore ? getScoreGrade(aiScore.totalScore) : null;

  if (!log) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h2 className="text-xl font-semibold text-white">岗位未找到</h2>
        <p className="text-slate-400">该投递记录不存在或已被删除</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-all"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 顶部导航 */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        返回投递列表
      </button>

      {/* 岗位头部信息 */}
      <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white">{log.jobTitle}</h2>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {log.companyName}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(log.timestamp).toLocaleString('zh-CN')}
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                {log.browser === 'chrome' ? 'Chrome' : 'Firefox'}
              </span>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium ${
            log.status === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : log.status === 'screened'
              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
              : log.status === 'failed'
              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
          }`}>
            {log.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {log.status === 'success' ? '投递成功' : log.status === 'screened' ? '被AI筛选' : log.status === 'failed' ? '投递失败' : '待处理'}
          </span>
        </div>
      </div>

      {/* JD 信息 + 加分项 */}
      <div className="grid grid-cols-5 gap-6">
        {/* JD 信息 */}
        <div className="col-span-3 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-cyan-400" />
            职位描述 (JD)
          </h3>
          <div className="prose prose-invert prose-sm max-w-none">
            {log.jd ? log.jd.split('\n').map((line, i) => {
              if (line.startsWith('【') && line.endsWith('】')) {
                return (
                  <h4 key={i} className="text-cyan-300 font-semibold mt-4 mb-2 text-base">
                    {line}
                  </h4>
                );
              }
              if (line.trim()) {
                return (
                  <p key={i} className="text-slate-300 leading-relaxed mb-1">
                    {line}
                  </p>
                );
              }
              return <br key={i} />;
            }) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
                  <h4 className="text-cyan-300 font-semibold mb-2">岗位信息</h4>
                  <p className="text-slate-300 leading-relaxed">
                    {log.jobTitle} — {log.companyName}
                  </p>
                  <p className="text-slate-500 text-sm mt-2">
                    投递时间：{new Date(log.timestamp).toLocaleString('zh-CN')}
                  </p>
                  <p className="text-slate-500 text-sm mt-1">
                    筛选结果：{log.message || '沟通中'}
                  </p>
                  <p className="text-slate-500 text-sm mt-1">
                    处理类型：{log.processorType || '未知'}
                  </p>
                </div>
                <div className="text-sm text-slate-500 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-amber-300 font-medium mb-1">提示</p>
                  <p>当前数据来自浏览器插件导出，不包含完整 JD 文本。如需查看完整职位描述，请前往 Boss 直聘网页查看。</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 加分项 */}
        <div className="col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" />
              加分项分析
            </h3>
            {log.bonusPoints && log.bonusPoints.length > 0 ? (
              <div className="space-y-3">
                {log.bonusPoints.map((bp, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 transition-all ${
                      bp.matched
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-slate-700/50 bg-slate-800/30 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${bp.matched ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {bp.matched ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColors[bp.category] || 'border-slate-600 bg-slate-800 text-slate-400'}`}>
                            {categoryIcons[bp.category]}
                            <span className="ml-1">{bp.category}</span>
                          </span>
                        </div>
                        <p className={`text-sm ${bp.matched ? 'text-slate-200' : 'text-slate-500'}`}>
                          {bp.description}
                        </p>
                        <p className="text-xs mt-1 text-slate-500">
                          {bp.matched ? '已匹配' : '未匹配'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500 space-y-3">
                <p>暂无加分项分析数据</p>
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3">
                  <p className="text-slate-400 text-xs">真实插件数据中不包含加分项信息。加分项分析需要结合 JD 文本和 AI 评分，可通过配置插件中的 AI 模型来实现。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== AI 评分详情 ====== */}
      {aiScore && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-6 space-y-6">
          {/* 标题栏 */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-400" />
              AI 评分详情
            </h3>
            {scoreGrade && (
              <span className={`text-xs px-3 py-1 rounded-full border ${scoreGrade.bg} ${scoreGrade.color} border-current/30`}>
                {scoreGrade.label}
              </span>
            )}
          </div>

          {/* 总分 */}
          <div className="flex items-center justify-center py-4">
            <div className="relative">
              <div className={`text-6xl font-bold ${aiScore.totalScore >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {aiScore.totalScore >= 0 ? '+' : ''}{aiScore.totalScore}
              </div>
              <div className="text-xs text-slate-500 text-center mt-1">综合评分</div>
            </div>
          </div>

          {/* 评分合计条 */}
          <div className="flex gap-4 justify-center">
            {aiScore.positiveItems.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-medium">
                  +{aiScore.positiveItems.reduce((s, i) => s + Math.abs(i.points), 0)}
                </span>
                <span className="text-slate-500">积极加分</span>
              </div>
            )}
            {aiScore.negativeItems.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-red-400 font-medium">
                  -{aiScore.negativeItems.reduce((s, i) => s + Math.abs(i.points), 0)}
                </span>
                <span className="text-slate-500">消极扣分</span>
              </div>
            )}
          </div>

          {/* 评分明细列表 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 积极加分 */}
            {aiScore.positiveItems.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2 pb-2 border-b border-emerald-500/20">
                  <Plus className="w-4 h-4" />
                  积极（加分） — {aiScore.positiveItems.length} 项
                </h4>
                {aiScore.positiveItems.map((item, i) => (
                  <div key={i} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 hover:border-emerald-500/40 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-200 flex-1">{item.reason}</p>
                      <span className="text-xs font-medium text-emerald-400 whitespace-nowrap shrink-0">
                        +{Math.abs(item.points)}分
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 消极扣分 */}
            {aiScore.negativeItems.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2 pb-2 border-b border-red-500/20">
                  <Minus className="w-4 h-4" />
                  消极（扣分） — {aiScore.negativeItems.length} 项
                </h4>
                {aiScore.negativeItems.map((item, i) => (
                  <div key={i} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 hover:border-red-500/40 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-200 flex-1">{item.reason}</p>
                      <span className="text-xs font-medium text-red-400 whitespace-nowrap shrink-0">
                        -{Math.abs(item.points)}分
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 原始文本折叠 */}
          <details className="group">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none">
              查看原始评分文本
            </summary>
            <pre className="mt-2 text-xs text-slate-500 bg-slate-800/50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
              {log.aiScoring?.message || ''}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

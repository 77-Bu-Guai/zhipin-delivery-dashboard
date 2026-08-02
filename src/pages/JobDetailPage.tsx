import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { parseAiScoreMessage, parseAiScoreForDisplay, getScoreGrade } from '@/utils/aiScoringParser';
import RawScoreBreakdown from '@/components/RawScoreBreakdown';
import {
  ArrowLeft, Building2, Briefcase, Calendar, Globe,
  CheckCircle2, XCircle, Star, Award, Zap, ThumbsUp,
  TrendingUp, TrendingDown, Minus, Plus, FileText, Flame,
  ChevronDown,
} from 'lucide-react';

const categoryIcons: Record<string, React.ReactNode> = {
  '技能匹配': <Zap className="w-4 h-4" />,
  '学历优势': <Award className="w-4 h-4" />,
  '经验优势': <Star className="w-4 h-4" />,
  '软技能': <ThumbsUp className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  '技能匹配': 'border-accent-200 bg-accent-50 text-accent-700',
  '学历优势': 'border-indigo-200 bg-indigo-50 text-indigo-700',
  '经验优势': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  '软技能': 'border-amber-200 bg-amber-50 text-amber-700',
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const getLogById = useAppStore((s) => s.getLogById);

  const log = id ? getLogById(id) : undefined;

  const status = searchParams.get('status') || '';
  const range = searchParams.get('range') || '';
  const from = searchParams.get('from') || 'dashboard';
  const backParams = new URLSearchParams();
  if (status) backParams.set('status', status);
  if (range) backParams.set('range', range);
  if (id) backParams.set('highlightId', id);
  const categoryParam = searchParams.get('category') || '';
  const backUrl = (
    from === 'today' ? '/today' :
    from === 'category-detail' ? `/category/${encodeURIComponent(categoryParam)}` :
    from === 'categories' ? '/categories' :
    '/dashboard'
  ) + (backParams.toString() ? '?' + backParams.toString() : '');

  // 返回列表页并带上 highlightId，让列表自动滚动到并高亮原行
  const handleBack = () => {
    navigate(backUrl, { replace: true });
  };

  const aiScore = log?.aiScoring?.message ? parseAiScoreMessage(log.aiScoring.message) : null;
  const aiDisplay = log?.aiScoring?.message ? parseAiScoreForDisplay(log.aiScoring.message) : null;
  const scoreGrade = aiScore ? getScoreGrade(aiScore.totalScore) : null;

  // 判断过滤类型：AI 评分的负面内容决定了被筛，还是其他系统过滤
  const filterStateName = log?.filterStateName || log?.message || '';
  const isSuccess = log?.status === 'success';
  const isAIFilter = filterStateName === 'AI筛选';
  const isNonAIFilter = !isSuccess && !isAIFilter && filterStateName !== '';

  if (!log) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[60vh] space-y-4 animate-in">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
          <FileText className="w-8 h-8 text-warm-400" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-warm-700">岗位未找到</h2>
        <p className="text-sm text-warm-400">该投递记录不存在或已被删除</p>
        <button
          onClick={handleBack}
          className="btn btn--secondary"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in">
      {/* 返回导航 */}
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-warm-400 hover:text-warm-700 transition-colors text-sm group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        返回投递列表
      </button>

      {/* 岗位头部 */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="space-y-2.5">
            <h2 className="font-display text-2xl tracking-tight text-warm-900">{log.jobTitle}</h2>
            <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-sm text-warm-500">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-warm-400" />
                <span className="text-warm-700 font-medium">{log.companyName}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-warm-400" />
                {new Date(log.timestamp).toLocaleString('zh-CN')}
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-warm-400" />
                {log.browser === 'chrome' ? 'Chrome' : '-'}
              </span>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border ${
            log.status === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : log.status === 'screened' || log.status === 'failed'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {log.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {log.status === 'success' ? '投递成功' : log.status === 'screened' ? '系统筛选' : log.status === 'failed' ? 'AI评分低于20分' : '待处理'}
          </span>
        </div>
      </div>

      {/* JD + 加分项 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* JD */}
        <div className="lg:col-span-3 card p-6">
          <h3 className="text-base font-semibold text-warm-800 mb-4 flex items-center gap-2">
            <Briefcase className="w-4.5 h-4.5 text-accent-500" strokeWidth={2} />
            职位描述 (JD)
          </h3>
          <div className="prose prose-sm max-w-none">
            {log.jd ? log.jd.split('\n').map((line, i) => {
              if (line.startsWith('【') && line.endsWith('】')) {
                return (
                  <h4 key={i} className="text-accent-600 font-semibold mt-4 mb-2 text-base">
                    {line}
                  </h4>
                );
              }
              if (line.trim()) {
                return (
                  <p key={i} className="text-warm-600 leading-relaxed mb-1">
                    {line}
                  </p>
                );
              }
              return <br key={i} />;
            }) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-warm-50 border border-warm-200 p-4 space-y-1.5">
                  <p className="text-accent-600 font-semibold">岗位信息</p>
                  <p className="text-warm-600">{log.jobTitle} — {log.companyName}</p>
                  <p className="text-sm text-warm-400">投递时间：{new Date(log.timestamp).toLocaleString('zh-CN')}</p>
                  <p className="text-sm text-warm-400">筛选结果：{log.message || '沟通中'}</p>
                  <p className="text-sm text-warm-400">处理类型：{log.processorType || '未知'}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-amber-700 font-semibold text-sm mb-1">提示</p>
                  <p className="text-sm text-amber-600">当前数据来自浏览器插件导出，不含完整 JD 文本。如需查看完整职位描述，请前往 Boss 直聘网页。</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 加分项 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-6">
            <h3 className="text-base font-semibold text-warm-800 mb-4 flex items-center gap-2">
              <Star className="w-4.5 h-4.5 text-amber-500" strokeWidth={2} />
              加分项分析
            </h3>
            {log.bonusPoints && log.bonusPoints.length > 0 ? (
              <div className="space-y-3">
                {log.bonusPoints.map((bp, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 transition-all ${
                      bp.matched
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-warm-200 bg-warm-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${bp.matched ? 'text-emerald-500' : 'text-warm-400'}`}>
                        {bp.matched ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-2xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${categoryColors[bp.category] || 'border-warm-200 bg-warm-100 text-warm-500'}`}>
                            {categoryIcons[bp.category]}
                            {bp.category}
                          </span>
                        </div>
                        <p className={`text-sm ${bp.matched ? 'text-warm-700' : 'text-warm-400'}`}>
                          {bp.description}
                        </p>
                        <p className="text-2xs mt-1 text-warm-400">
                          {bp.matched ? '已匹配' : '未匹配'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-warm-400 space-y-3">
                <p>暂无加分项分析数据</p>
                <div className="rounded-xl bg-warm-50 border border-warm-200 p-3">
                  <p className="text-warm-500 text-xs">真实插件数据中不包含加分项信息。加分项分析需要结合 JD 文本和 AI 评分，可通过配置插件中的 AI 模型来实现。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI 评分详情 / AI 兼容性预览 */}
      {aiScore && (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-warm-800 flex items-center gap-2">
              <Zap className="w-4.5 h-4.5 text-accent-500" strokeWidth={2} />
              {isAIFilter || isSuccess ? 'AI 评分详情' : 'AI 兼容性预览'}
            </h3>
            <div className="flex items-center gap-2">
              {scoreGrade && (
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${scoreGrade.bgClass} ${scoreGrade.textClass} border ${scoreGrade.borderClass}`}>
                  {scoreGrade.label} 级
                </span>
              )}
              {aiDisplay?.hasFatal && isAIFilter && (
                <span className="badge badge--error text-2xs flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  致命扣分 x{aiDisplay.fatalCount}
                </span>
              )}
            </div>
          </div>

          {/* 非 AI 过滤提示 */}
          {isNonAIFilter && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              <p className="font-medium mb-1">本岗位未被 AI 评分过滤</p>
              <p className="text-amber-600">实际被 <span className="font-semibold">{filterStateName}</span> 拒绝，AI 评分仅表示如果通过过滤，岗位与你的匹配度（仅供参考）。</p>
            </div>
          )}

          {/* 总分 */}
          <div className="flex items-center justify-center py-4">
            <div className="text-center">
              <div className={`font-display text-4xl sm:text-6xl tracking-tight ${aiScore.totalScore >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {aiScore.totalScore >= 0 ? '+' : ''}{aiScore.totalScore}
              </div>
              <p className="text-xs text-warm-400 mt-1">综合评分 = 加分 + 扣分</p>
            </div>
          </div>

          {/* 合计条 */}
          <div className="flex gap-6 justify-center">
            {aiDisplay && aiDisplay.positives.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-600 font-semibold">+{aiDisplay.totalPosPoints}</span>
                <span className="text-warm-400">积极（{aiDisplay.positives.length}项）</span>
              </div>
            )}
            {aiDisplay && aiDisplay.deductions.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-red-600 font-semibold">-{aiDisplay.totalNegPoints}</span>
                <span className="text-warm-400">消极（{aiDisplay.deductions.length}项）</span>
              </div>
            )}
          </div>

          {/* 明细 — 按分值降序排列 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 积极（按分值排序） */}
            {aiDisplay && aiDisplay.positives.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-emerald-600 flex items-center gap-2 pb-2 border-b border-emerald-200">
                  <Plus className="w-4 h-4" />
                  积极（加分）— {aiDisplay.positives.length} 项 · 共 +{aiDisplay.totalPosPoints} 分
                </h4>
                {aiDisplay.positives.map((item, i) => (
                  <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 hover:border-emerald-300 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-warm-700">{item.reason}</p>
                        <p className="text-2xs text-warm-400 mt-0.5">贡献占比 {item.percentage}%</p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap flex-shrink-0">
                        +{item.points}分
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 消极（按分值降序，致命项高亮） */}
            {aiDisplay && aiDisplay.deductions.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-red-600 flex items-center gap-2 pb-2 border-b border-red-200">
                  <Minus className="w-4 h-4" />
                  消极（扣分）— {aiDisplay.deductions.length} 项 · 共 -{aiDisplay.totalNegPoints} 分
                </h4>
                {aiDisplay.deductions.map((item, i) => {
                  const isFatal = item.points >= 1000;
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 transition-all ${
                        isFatal
                          ? 'border-red-400 bg-red-100 ring-1 ring-red-300'
                          : 'border-red-200 bg-red-50/50 hover:border-red-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {isFatal && <Flame className="w-3.5 h-3.5 text-red-500" />}
                            <p className={`text-sm ${isFatal ? 'text-red-800 font-semibold' : 'text-warm-700'}`}>
                              {item.reason}
                            </p>
                          </div>
                          <p className={`text-2xs mt-0.5 ${isFatal ? 'text-red-600 font-medium' : 'text-warm-400'}`}>
                            扣 {item.points} 分 · 占所有扣分 {item.percentage}%
                          </p>
                        </div>
                        <span className={`text-xs font-bold whitespace-nowrap flex-shrink-0 px-2 py-0.5 rounded ${
                          isFatal ? 'bg-red-200 text-red-700' : 'text-red-600'
                        }`}>
                          -{item.points}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 原始文本 — 可视化版 */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-xs text-warm-400 cursor-pointer hover:text-warm-600 transition-colors select-none">
              <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              查看完整评分明细
            </summary>
            <div className="mt-3">
              <RawScoreBreakdown message={log.aiScoring?.message} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

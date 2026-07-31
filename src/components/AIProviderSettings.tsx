import { useEffect, useRef, useState } from 'react';
import {
  X,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  Server,
  Cloud,
  Settings2,
  Eye,
  EyeOff,
  Download,
  Upload,
  HardDrive,
  Sliders,
  Info,
  RotateCcw,
} from 'lucide-react';
import {
  PROVIDER_META,
  DEFAULT_SETTINGS,
  loadAISettings,
  saveAISettings,
  syncAISettingsFromServer,
  exportAISettings,
  importAISettings,
  testProvider,
  type AISettings,
  type ProviderId,
  type TestResult,
} from '@/lib/aiProvider';

const ICONS: Record<ProviderId, React.ReactNode> = {
  spark: <Cloud className="w-4 h-4" />,
  agnes: <Server className="w-4 h-4" />,
  custom: <Settings2 className="w-4 h-4" />,
};

/**
 * AI 接口配置面板（前端自配置）
 * - 三个切换按钮：科大讯飞星火 / agnes / 自定义
 * - 每个供应商独立保存 Base URL、API Key、Model
 * - 支持「测试连接」实时验证，配置存 localStorage，切换即时生效
 * - 「运行时参数」卡片：原调试中心面板整体搬入（max_tokens / top-k / temperature / 多轮对话 / 清除历史）
 */
export default function AIProviderSettings({
  onClose,
  maxTokens,
  setMaxTokens,
  topK,
  setTopK,
  temperature,
  setTemperature,
  multiTurn,
  setMultiTurn,
  onClearHistory,
  maxTokensLimit,
  activeProviderId,
  activeModel,
}: {
  onClose: () => void;
  maxTokens: number;
  setMaxTokens: (v: number) => void;
  topK: number;
  setTopK: (v: number) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  multiTurn: boolean;
  setMultiTurn: (v: boolean) => void;
  onClearHistory: () => void;
  maxTokensLimit: number;
  /** 当前生效的 provider（运行时参数归属方），用于卡片标题与备注 */
  activeProviderId: ProviderId;
  /** 当前生效的 model，显示在深色卡片标题里给用户看上下文 */
  activeModel: string;
}) {
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  // 面板里正在编辑（查看）的供应商，默认等于当前生效的
  const [editing, setEditing] = useState<ProviderId>(settings.active);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);
  // 是否已确认服务端落盘可用（决定底部提示文案）
  const [fileBacked, setFileBacked] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const meta = PROVIDER_META.find((p) => p.id === editing)!;
  const cfg = settings.providers[editing];
  // 「运行时参数」卡片始终反映当前生效的 provider（不是正在编辑的那一个），
  // 否则切换 tab 看别的 provider 配置时，标题会跟着变，但滑块控制的是当前 active 的请求，造成割裂
  const activeMeta = PROVIDER_META.find((p) => p.id === activeProviderId)!;

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 打开面板时探测服务端落盘是否可用，并尝试从文件恢复更新的配置
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/ai-config', { method: 'GET', cache: 'no-store' });
        if (alive && res.ok && res.headers.get('x-ai-config')) setFileBacked(true);
      } catch {
        /* 静态部署没有这个接口，属正常 */
      }
      const restored = await syncAISettingsFromServer();
      if (alive && restored) {
        setSettings(restored);
        setEditing(restored.active);
        setNotice('已从本地配置文件恢复上次保存的配置');
        setTimeout(() => alive && setNotice(''), 3000);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function patch(field: keyof typeof cfg, value: string) {
    setSettings((s) => ({
      ...s,
      providers: { ...s.providers, [editing]: { ...s.providers[editing], [field]: value } },
    }));
    setResult(null);
    setSaved(false);
  }

  /** 点击供应商按钮：既切换编辑对象，也把它设为生效供应商 */
  function activate(id: ProviderId) {
    setEditing(id);
    setShowKey(false);
    setResult(null);
    setSettings((s) => ({ ...s, active: id }));
    setSaved(false);
  }

  function handleSave() {
    setSettings(saveAISettings(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function handleTest() {
    setTesting(true);
    setResult(null);
    // 先落盘再测，保证测的就是即将生效的配置
    setSettings(saveAISettings(settings));
    const r = await testProvider(editing, settings.providers[editing]);
    setResult(r);
    setTesting(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选同一个文件
    if (!file) return;
    try {
      const restored = await importAISettings(file);
      setSettings(restored);
      setEditing(restored.active);
      setResult(null);
      setNotice(`已从备份恢复配置（当前：${PROVIDER_META.find((p) => p.id === restored.active)?.label}）`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(`导入失败：${(err as Error).message}`);
      setTimeout(() => setNotice(''), 4000);
    }
  }

  function handleReset() {
    if (!confirm(`确定把「${meta.label}」恢复成默认配置？（API Key 会被清空）`)) return;
    setSettings((s) => ({
      ...s,
      providers: { ...s.providers, [editing]: { ...DEFAULT_SETTINGS.providers[editing] } },
    }));
    setResult(null);
    setSaved(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 bg-warm-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-white dark:bg-warm-900 border border-warm-200 dark:border-warm-800 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：sticky 顶部，始终可见 */}
        <div className="flex-shrink-0 sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-warm-200 dark:border-warm-800 bg-white/95 dark:bg-warm-900/95 backdrop-blur rounded-t-2xl">
          <div>
            <h3 className="text-base font-semibold text-warm-800 dark:text-warm-100">AI 接口配置</h3>
            <p className="text-xs text-warm-400 mt-0.5">
              选一个来源，填好地址和 Key，点「测试连接」验证，保存后立刻生效
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-warm-600 hover:text-warm-900 hover:bg-warm-100 dark:text-warm-400 dark:hover:text-warm-100 dark:hover:bg-warm-800 border border-warm-200 dark:border-warm-700 transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">关闭</span>
          </button>
        </div>

        {/* 中间表单区：可滚动 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* 供应商切换按钮 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PROVIDER_META.map((p) => {
              const isActive = settings.active === p.id;
              const isEditing = editing === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => activate(p.id)}
                  className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-accent-500 text-white border-accent-500 shadow-lg shadow-accent-500/25 -translate-y-0.5'
                      : isEditing
                        ? 'bg-accent-50 text-accent-700 border-accent-300 dark:bg-accent-900/20 dark:text-accent-300'
                        : 'bg-white text-warm-600 border-warm-200 hover:border-accent-300 hover:text-accent-600 hover:-translate-y-0.5 dark:bg-warm-900 dark:text-warm-400 dark:border-warm-800'
                  }`}
                >
                  {ICONS[p.id]}
                  {p.label}
                  {isActive && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/90" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-2 text-xs text-warm-500 bg-warm-50 dark:bg-warm-800/40 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-accent-500" />
            <span>{meta.hint}</span>
          </div>

          {/* 配置表单 */}
          <div className="space-y-3">
            <Field label="接口地址 Base URL">
              <input
                value={cfg.baseUrl}
                onChange={(e) => patch('baseUrl', e.target.value)}
                placeholder="https://.../v1"
                spellCheck={false}
                className="input w-full"
              />
              <p className="text-[11px] text-warm-400 mt-1">
                填到 <code className="font-mono">/v1</code> 即可，程序会自动补
                <code className="font-mono"> /chat/completions</code>
              </p>
            </Field>

            <Field label="API Key">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={cfg.apiKey}
                  onChange={(e) => patch('apiKey', e.target.value)}
                  placeholder={meta.keyPlaceholder}
                  spellCheck={false}
                  autoComplete="off"
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-warm-400 hover:text-warm-600 transition-colors"
                  title={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {meta.docUrl && (
                <a
                  href={meta.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent-600 hover:text-accent-700 mt-1"
                >
                  {meta.docLabel ?? '获取 / 查看'} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </Field>

            <Field label="模型 Model">
              {meta.modelOptions?.length ? (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {meta.modelOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => patch('model', m)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-mono border transition-colors ${
                        cfg.model === m
                          ? 'bg-accent-500 text-white border-accent-500'
                          : 'bg-white text-warm-500 border-warm-200 hover:border-accent-300 hover:text-accent-600 dark:bg-warm-900 dark:border-warm-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                value={cfg.model}
                onChange={(e) => patch('model', e.target.value)}
                placeholder={meta.modelPlaceholder}
                spellCheck={false}
                className="input w-full"
              />
              <p className="text-[11px] text-warm-400 mt-1">
                严格区分大小写，常见值见上方一键点选；自定义可手填
              </p>
            </Field>

            {/* 运行时参数卡片（原调试中心面板整体搬入，跟主题一致的浅色样式：max_tokens / top-k / temperature / 多轮对话 / 清除历史） */}
            <div className="mt-1 rounded-xl border border-warm-200 dark:border-warm-800 bg-warm-50/50 dark:bg-warm-800/30 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-warm-500" />
                  <span className="text-sm font-medium text-warm-700 dark:text-warm-200">
                    运行时参数
                  </span>
                  <span className="text-[11px] text-warm-500 dark:text-warm-400">
                    · {activeMeta.label}
                    {activeModel ? ` · ${activeModel}` : ''}
                  </span>
                </div>
                <span className="relative inline-flex items-center group/tip">
                  <Info
                    className="w-3.5 h-3.5 text-warm-400 group-hover/tip:text-accent-500 cursor-help transition-colors"
                    strokeWidth={2}
                  />
<span
                  role="tooltip"
                  className="pointer-events-none invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100 transition-opacity duration-150 absolute top-full mt-1.5 right-0 z-50 w-60 px-3 py-2 rounded-lg bg-warm-900 dark:bg-warm-700 text-white text-[11px] leading-relaxed shadow-xl whitespace-normal font-normal text-left"
                >
                  {activeProviderId === 'spark' && 'Lite 永久免费；Pro/Max/4.0 Ultra 走应用 APIPassword 鉴权，需 WebSocket 接入。'}
                  {activeProviderId === 'agnes' && 'OpenAI 兼容 Bearer 鉴权；当前 model 上下文 256K，Max Output 64K。'}
                  {activeProviderId === 'custom' && '任何 OpenAI 兼容接口；max_tokens 上限取决于你填的模型。'}
                  <span className="absolute top-[-4px] right-3 w-2 h-2 bg-warm-900 dark:bg-warm-700 rotate-45" />
                </span>
                </span>
              </div>

              <ParamSliderRow
                label="max_tokens（回复长度限制）"
                tooltip={`单位为 tokens，1 token ≈ 1.5 个中文或 0.8 个英文。该模型上限 ${maxTokensLimit.toLocaleString()}。`}
                value={`${maxTokens.toLocaleString()} / ${maxTokensLimit.toLocaleString()}`}
                sliderValue={maxTokens}
                onSliderChange={setMaxTokens}
                min={1}
                max={maxTokensLimit}
                step={1}
              />

              <ParamSliderRow
                label="top-k（灵活度）"
                tooltip="平衡生成文本的质量和多样性。较小的 k 更稳定，较大的 k 更新颖。取值 [1, 6]，默认 4。"
                value={String(topK)}
                sliderValue={topK}
                onSliderChange={setTopK}
                min={1}
                max={6}
                step={1}
              />

              <ParamSliderRow
                label="temperature（随机性）"
                tooltip="核采样阈值，越高随机性越强。取值 (0, 2]，默认 1.0。"
                value={temperature.toFixed(1)}
                sliderValue={temperature}
                onSliderChange={setTemperature}
                min={0}
                max={2}
                step={0.1}
                tooltipUp
              />

              <div className="flex items-center justify-between pt-1">
                <label className="text-xs font-medium text-warm-600 dark:text-warm-300">
                  多轮对话
                </label>
                <button
                  type="button"
                  onClick={() => setMultiTurn(!multiTurn)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    multiTurn
                      ? 'bg-accent-500'
                      : 'bg-warm-300 dark:bg-warm-700'
                  }`}
                  aria-pressed={multiTurn}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      multiTurn ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={onClearHistory}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-warm-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-warm-200 dark:border-warm-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                清除历史记录
              </button>
            </div>
          </div>
        </div>

        {/* 底部操作区 + 存储信息：sticky 底部，始终可见 */}
        <div className="flex-shrink-0 sticky bottom-0 z-10 px-5 py-3 border-t border-warm-200 dark:border-warm-800 bg-white/95 dark:bg-warm-900/95 backdrop-blur rounded-b-2xl space-y-2.5">
          {/* 测试结果 */}
          {result && (
            <div
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
                result.ok
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-red-600 bg-red-50 border-red-200'
              }`}
            >
              {result.ok ? (
                <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              )}
              <span className="break-all">
                {result.ok
                  ? `连接成功（${result.latencyMs}ms）${result.sample ? ` · 模型回复：${result.sample}` : ''}`
                  : `连接失败：${result.message}`}
              </span>
            </div>
          )}

          {/* 操作区 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-warm-200 dark:border-warm-800 text-warm-600 dark:text-warm-300 hover:border-accent-300 hover:text-accent-600 transition-all disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-xs font-medium text-warm-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              恢复默认
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSave}
              className="btn btn--primary px-5 py-2 text-xs inline-flex items-center gap-1.5"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : null}
              {saved ? '已保存' : '保存并使用'}
            </button>
          </div>

          {/* 存储状态 + 备份 */}
          <div className="border-t border-warm-100 dark:border-warm-800 pt-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] text-warm-500">
                <HardDrive
                  className={`w-3.5 h-3.5 ${fileBacked ? 'text-emerald-500' : 'text-warm-400'}`}
                />
                {fileBacked ? (
                  <span>
                    已双重保存：<strong className="text-warm-600 dark:text-warm-300">浏览器</strong> +{' '}
                    <strong className="text-warm-600 dark:text-warm-300">项目根目录 .ai-config.json</strong>
                    ，清缓存也不会丢
                  </span>
                ) : (
                  <span>已保存到浏览器本地（localStorage / sessionStorage / cookie 三重）</span>
                )}
                {settings.updatedAt ? (
                  <span className="text-warm-400">
                    · 最后保存 {new Date(settings.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => exportAISettings(settings)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-warm-500 hover:text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-colors"
                  title="导出为 JSON 备份文件（换电脑 / 重装系统时用）"
                >
                  <Download className="w-3 h-3" />
                  导出备份
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-warm-500 hover:text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-colors"
                  title="从备份文件恢复配置"
                >
                  <Upload className="w-3 h-3" />
                  导入恢复
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImport}
                  className="hidden"
                />
              </div>
            </div>

            {notice && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                <Check className="w-3 h-3 flex-shrink-0" />
                {notice}
              </div>
            )}

            <p className="text-[11px] text-warm-400 leading-relaxed">
              配置全部保存在你自己的电脑上，不会上传到任何服务器。开发模式下 API
              请求由本地 dev server 中转（绕开跨域），Key 不会写进打包产物，也不会被 git 提交。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-warm-600 dark:text-warm-300">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/**
 * 参数滑块行（用在模态框的「运行时参数」卡片里）：
 * label + Ⓡ 提示 + 当前值，右上角；下方全宽 range 滑块。
 * 颜色按模态框主题调（warm 浅色 / dark 中等深色），跟其它表单项一致。
 */
function ParamSliderRow({
  label,
  tooltip,
  value,
  sliderValue,
  onSliderChange,
  min,
  max,
  step,
  /** 最后一行（temperature）下方空间不足时改向上展开，避免被滚动容器裁切 */
  tooltipUp = false,
}: {
  label: string;
  tooltip: string;
  value: string;
  sliderValue: number;
  onSliderChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  tooltipUp?: boolean;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Number(v.toFixed(2))));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-warm-600 dark:text-warm-300 min-w-0">
          <span className="truncate">{label}</span>
          <span
            className="relative inline-flex items-center group/tip flex-shrink-0"
          >
            <Info
              className="w-3 h-3 text-warm-400 group-hover/tip:text-accent-500 cursor-help transition-colors"
              strokeWidth={2}
            />
            <span
              role="tooltip"
              className={`pointer-events-none invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100 transition-opacity duration-150 absolute left-0 z-50 w-56 px-3 py-2 rounded-lg bg-warm-900 dark:bg-warm-700 text-white text-[11px] leading-relaxed shadow-xl whitespace-normal font-normal text-left ${
                tooltipUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
              }`}
            >
              {tooltip}
              <span
                className={`absolute left-3 w-2 h-2 bg-warm-900 dark:bg-warm-700 rotate-45 ${
                  tooltipUp ? 'bottom-[-4px]' : 'top-[-4px]'
                }`}
              />
            </span>
          </span>
        </label>
        <span className="text-xs font-mono tabular-nums text-warm-700 dark:text-warm-200 flex-shrink-0">
          {value}
        </span>
      </div>
      <input
        type="range"
        value={sliderValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onSliderChange(clamp(Number(e.target.value)))}
        className="w-full mt-1.5 accent-accent-500"
      />
    </div>
  );
}

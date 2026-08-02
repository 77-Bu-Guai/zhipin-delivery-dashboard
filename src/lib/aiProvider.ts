/**
 * AI 供应商配置中心（前端可视化自配置）
 *
 * 设计要点：
 * 1. 用户可在前端面板自由切换「科大讯飞星火 / agnes / 自定义」三种接入方式，
 *    每种都能单独填 Base URL、API Key、Model，配置持久化在 localStorage。
 * 2. 浏览器直连第三方 API 会被 CORS 拦截，因此默认走 dev server 的 `/ai-proxy` 动态中继：
 *    前端把目标端点和 key 放在请求头里，由 Node 侧转发。中继不存在时（纯静态部署）自动回退直连。
 * 3. 星火在「不填 key」时会走老的 `/mimo` 代理，由 dev server 从 .env.local 注入 key，
 *    保持与既有脚本、旧行为完全兼容。
 */

export type ProviderId = 'spark' | 'agnes' | 'custom';

export interface ProviderConfig {
  /** OpenAI 兼容的 base url，末尾不带 /chat/completions */
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AISettings {
  active: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
  /** 最后一次保存的时间戳，用于「文件 vs localStorage」冲突时取新的那份 */
  updatedAt?: number;
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** 面板上的一句话说明 */
  hint: string;
  /** 是否必须填 key */
  keyRequired: boolean;
  keyPlaceholder: string;
  modelPlaceholder: string;
  /** 常见 model 下拉建议，避免用户瞎填 "Spark Lite" 这类 */
  modelOptions?: string[];
  /** 获取 key 的地址，没有则为空 */
  docUrl?: string;
  /** 文档链接旁的说明文字，描述「去哪里点哪个按钮」 */
  docLabel?: string;
  /**
   * 该 provider 推荐的回复长度上限（max_tokens 上界，单位 token）。
   * 来源：各模型官方文档。
   * - Spark Lite: 4096（官方限制）
   * - agnes-2.0-flash: 65536（Context 256K / Max Output 64K，2026-06 回滚后的稳定值）
   * - custom: 4096（保守默认）
   */
  defaultMaxTokens?: number;
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'spark',
    label: '科大讯飞 星火',
    hint: 'Lite 版本永久免费，你的 PAT 只对应 Spark Lite，模型固定填 lite（小写，不是"Spark Lite"这四个字）。Key 用「个人访问令牌 PAT」，不是「应用 APIPassword」。留空则使用 .env.local 里的 SPARK_API_KEY。',
    keyRequired: false,
    keyPlaceholder: 'PAT 个人访问令牌（Bearer 格式）',
    modelPlaceholder: 'lite',
    modelOptions: ['lite'],
    docUrl: 'https://console.xfyun.cn/services/bmx1',
    docLabel: '控制台 → 个人访问令牌（PAT）',
    defaultMaxTokens: 4096,
  },
  {
    id: 'agnes',
    label: 'agnes',
    hint: '原来用的后端，填上你的网关地址即可切回。',
    keyRequired: true,
    keyPlaceholder: 'agnes API Key',
    modelPlaceholder: 'agnes-2.0-flash',
    defaultMaxTokens: 65536,
  },
  {
    id: 'custom',
    label: '自定义接口',
    hint: '任何 OpenAI 兼容接口都能接：DeepSeek、Kimi、智谱、OpenRouter、自建网关…',
    keyRequired: true,
    keyPlaceholder: 'sk-...',
    modelPlaceholder: 'deepseek-chat',
    modelOptions: ['deepseek-chat', 'moonshot-v1-8k', 'glm-4-flash', 'gpt-4o-mini'],
    defaultMaxTokens: 4096,
  },
];

/** 把星火等中英文错误翻成人话 */
export function translateApiError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('hmac') && m.includes('secret key')) {
    return '鉴权失败：你填的是「应用 APIPassword」格式，Bearer 鉴权要的是「个人访问令牌 PAT」。打开 https://console.xfyun.cn → 头像 → 个人访问令牌 → 新建，把生成的 PAT 粘进来。';
  }
  if (m.includes('unauthorized') || m === '401' || m.includes('http 401')) {
    return '鉴权失败（401）。星火 Key 必须是「个人访问令牌 PAT」，不是「应用 APIPassword」。其他平台请检查 Key 是否过期或被吊销。';
  }
  if (m.includes('forbidden') || m === '403' || m.includes('http 403')) {
    return '没有权限（403）。Key 可能失效或该模型没开通。星火控制台 → 我的应用 → 确认 Lite 模型已勾选。';
  }
  if (m.includes('invalid api key') || m.includes('invalid_api_key') || m.includes('authentication')) {
    return 'API Key 无效或已过期，请去对应控制台重新生成。';
  }
  if (m.includes('insufficient balance') || m.includes('insufficient_balance') || m.includes('quota')) {
    return '账户余额不足，去控制台充值或换一个免费接口（如自定义接入开源模型 / SiliconFlow 等）。';
  }
  if (m.includes('model not found') || m.includes('model_not_found') || m.includes('unknown model')) {
    return '模型名称拼错了。星火 Lite 必须是小写 `lite`，不是 `Spark Lite`。看下拉建议选一个。';
  }
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('429')) {
    return '请求太频繁，等几秒再试。';
  }
  if (m.includes('fetch failed') || m.includes('econnrefused')) {
    return '连不上对方服务器。请检查 Base URL 是否拼写正确、是否需要代理（如公司 / 校园网）。';
  }
  return raw;
}

export const DEFAULT_SETTINGS: AISettings = {
  active: 'spark',
  providers: {
    spark: {
      baseUrl: 'https://spark-api-open.xf-yun.com/v1',
      apiKey:
        (import.meta as unknown as { env?: Record<string, string> })?.env
          ?.VITE_SPARK_API_KEY ?? '',
      model: 'lite',
    },
    agnes: {
      baseUrl:
        (import.meta as unknown as { env?: Record<string, string> })?.env
          ?.VITE_AGNES_BASE_URL ?? '',
      apiKey:
        (import.meta as unknown as { env?: Record<string, string> })?.env
          ?.VITE_AGNES_API_KEY ?? '',
      model: 'agnes-2.0-flash',
    },
    custom: {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat',
    },
  },
};

const STORAGE_KEY = 'boss.ai.settings.v1';
/** localStorage 之外再存一份到 sessionStorage + cookie，多重兜底 */
const COOKIE_KEY = 'boss_ai_settings_v1';
/** 服务端落盘接口（vite 插件 aiConfigStorePlugin 提供） */
const CONFIG_API = '/ai-config';
/** 配置变更时广播，多个组件实例可同步 */
export const AI_SETTINGS_EVENT = 'boss:ai-settings-changed';

/** 把任意来源的部分配置补全成完整 AISettings（新增字段/供应商时老配置不会缺键） */
function normalize(parsed: Partial<AISettings> | null | undefined): AISettings | null {
  if (!parsed || typeof parsed !== 'object' || !parsed.providers) return null;
  const active: ProviderId =
    parsed.active && parsed.active in DEFAULT_SETTINGS.providers
      ? parsed.active
      : DEFAULT_SETTINGS.active;
  const providers = { ...DEFAULT_SETTINGS.providers };
  (Object.keys(providers) as ProviderId[]).forEach((id) => {
    providers[id] = { ...DEFAULT_SETTINGS.providers[id], ...(parsed.providers?.[id] ?? {}) };
  });
  return { active, providers, updatedAt: parsed.updatedAt ?? 0 };
}

function safeParse(raw: string | null): AISettings | null {
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw) as Partial<AISettings>);
  } catch {
    return null;
  }
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(json: string) {
  if (typeof document === 'undefined') return;
  try {
    // 10 年有效期；仅同源可读，不发跨站
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(json)}; path=/; max-age=${10 * 365 * 24 * 3600}; SameSite=Lax`;
  } catch {
    /* cookie 超长或被禁用，忽略 */
  }
}

/**
 * 同步读取配置（秒出，用于首屏渲染）。
 * 依次尝试 localStorage → sessionStorage → cookie，取 updatedAt 最新的那份。
 * 服务端落盘的文件由 syncAISettingsFromServer() 异步补充，见下。
 */
export function loadAISettings(): AISettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const candidates: (AISettings | null)[] = [];
  try {
    candidates.push(safeParse(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    /* 无痕模式可能直接抛异常 */
  }
  try {
    candidates.push(safeParse(window.sessionStorage.getItem(STORAGE_KEY)));
  } catch {
    /* ignore */
  }
  candidates.push(safeParse(readCookie()));

  const best = candidates
    .filter((c): c is AISettings => c !== null)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  return best ?? DEFAULT_SETTINGS;
}

/**
 * 保存配置：本地三处同时写（立即生效、刷新不丢），
 * 同时后台异步写一份到项目根目录的 .ai-config.json（清缓存/换端口/换浏览器也能恢复）。
 */
export function saveAISettings(settings: AISettings): AISettings {
  const stamped: AISettings = { ...settings, updatedAt: Date.now() };
  if (typeof window === 'undefined') return stamped;
  const json = JSON.stringify(stamped);

  try {
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* 隐私模式下不可写 */
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
  writeCookie(json);

  // 后台落盘，失败不阻塞 UI（纯静态部署时没有这个接口，属正常情况）
  void fetch(CONFIG_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  }).catch(() => {
    /* 无服务端持久化，本地三处已足够 */
  });

  window.dispatchEvent(new CustomEvent(AI_SETTINGS_EVENT, { detail: stamped }));
  return stamped;
}

/**
 * 从服务端落盘文件恢复配置（应用启动时调用一次）。
 * 场景：用户清了浏览器缓存 / 换了端口 / 换了浏览器 / 用 Electron 打开 —— 本地存储是空的，
 * 但 .ai-config.json 还在，这里把它捞回来。
 *
 * 冲突处理：比对 updatedAt，谁新用谁；本地更新则反向把本地推给服务端。
 * 返回最终生效的配置，无变化时返回 null（调用方无需 setState）。
 */
export async function syncAISettingsFromServer(): Promise<AISettings | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(CONFIG_API, { method: 'GET', cache: 'no-store' });
    if (!res.ok || !res.headers.get('x-ai-config')) return null;

    const remote = normalize((await res.json()) as Partial<AISettings>);
    const local = loadAISettings();
    const localStamp = local.updatedAt ?? 0;
    const remoteStamp = remote?.updatedAt ?? 0;

    // 服务端更新 → 写回本地三处（注意不要再 POST 回去，避免来回抖动）
    if (remote && remoteStamp > localStamp) {
      const json = JSON.stringify(remote);
      try {
        window.localStorage.setItem(STORAGE_KEY, json);
      } catch {
        /* ignore */
      }
      try {
        window.sessionStorage.setItem(STORAGE_KEY, json);
      } catch {
        /* ignore */
      }
      writeCookie(json);
      window.dispatchEvent(new CustomEvent(AI_SETTINGS_EVENT, { detail: remote }));
      return remote;
    }

    // 本地更新（或服务端还没文件）→ 把本地推上去补齐
    if (localStamp > remoteStamp) {
      void fetch(CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local),
      }).catch(() => {
        /* ignore */
      });
    }
    return null;
  } catch {
    return null;
  }
}

/** 导出配置为可下载的 JSON 备份（换机器 / 重装系统时用） */
export function exportAISettings(settings: AISettings): void {
  const json = JSON.stringify({ ...settings, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-接口配置备份-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 从备份 JSON 文件恢复配置 */
export async function importAISettings(file: File): Promise<AISettings> {
  const text = await file.text();
  const parsed = normalize(JSON.parse(text) as Partial<AISettings>);
  if (!parsed) throw new Error('文件格式不对，不是有效的接口配置备份');
  return saveAISettings(parsed);
}

export function getProviderLabel(id: ProviderId): string {
  return PROVIDER_META.find((p) => p.id === id)?.label ?? id;
}

/** 取当前生效的供应商配置 */
export function getActiveConfig(settings: AISettings): ProviderConfig & { id: ProviderId } {
  return { id: settings.active, ...settings.providers[settings.active] };
}

/** 拼出最终的 chat/completions 端点 */
export function resolveEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

/**
 * 取该 provider 推荐的 max_tokens 上限。
 * 用于 SliderInput 的 max 属性，让滑块范围跟随当前 active provider 调整。
 * 找不到对应的预设时回退 4096。
 */
export function getDefaultMaxTokens(id: ProviderId): number {
  return PROVIDER_META.find((m) => m.id === id)?.defaultMaxTokens ?? 4096;
}

/**
 * 各 model 的实际 max_tokens 上限（来自各模型官方文档）。
 * 优先级高于 provider 级 defaultMaxTokens。查不到时回退到 getDefaultMaxTokens。
 */
export const MODEL_MAX_TOKENS: Record<string, number> = {
  // 科大讯飞星火（https://static.xfyun.cn/doc/spark/HTTP调用文档.html）
  lite: 4096,
  pro: 8192,
  'pro-128k': 32768,
  max: 8192,
  'max-32k': 32768,
  ultra: 32768,
  '4.0 ultra': 32768,
  '4.0ultra': 32768,
  x1: 32768,
  'x1.5': 32768,
  // agnes（AgnesAI GitHub Catalog + freellm.net：Max Output 64K）
  'agnes-2.0-flash': 65536,
  'agnes-1.5-flash': 65536,
  // 常见 custom 模型
  'deepseek-chat': 8192,
  'deepseek-reasoner': 65536,
  'moonshot-v1-8k': 8192,
  'moonshot-v1-32k': 32768,
  'moonshot-v1-128k': 65536,
  'glm-4-flash': 16000,
  'glm-4-plus': 16000,
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4.1': 32768,
  'gpt-4.1-mini': 32768,
};

/**
 * 取该 provider+model 的实际 max_tokens 上限。
 * 先按 model 精确查表（不区分大小写），再按 provider 查，最后回退 4096。
 */
export function getModelMaxTokens(id: ProviderId, model = ''): number {
  const m = model.trim().toLowerCase();
  if (m && MODEL_MAX_TOKENS[m] !== undefined) return MODEL_MAX_TOKENS[m];
  return getDefaultMaxTokens(id);
}

/** 配置是否可用（缺 base url 或缺必填 key 时给出人话提示） */
export function validateConfig(id: ProviderId, cfg: ProviderConfig): string | null {
  const meta = PROVIDER_META.find((p) => p.id === id);
  if (id === 'spark' && !cfg.apiKey.trim()) {
    // 允许走 dev 代理注入 key
    return null;
  }
  if (!cfg.baseUrl.trim()) return `请先填写「${meta?.label ?? id}」的接口地址（Base URL）`;
  if (meta?.keyRequired && !cfg.apiKey.trim()) return `请先填写「${meta.label}」的 API Key`;
  return null;
}

/**
 * 统一发起一次 chat/completions 请求。
 * 返回原始 Response，调用方自行判断 status（AIChat 需要按状态码做重试策略）。
 */
export async function postChat(body: unknown, settings: AISettings): Promise<Response> {
  const cfg = getActiveConfig(settings);
  const payload = typeof body === 'string' ? body : JSON.stringify(body);

  // 星火 + 未填 key：沿用老的 /mimo 代理，key 由 dev server 从 .env.local 注入
  if (cfg.id === 'spark' && !cfg.apiKey.trim()) {
    return fetch('/mimo/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
  }

  const endpoint = resolveEndpoint(cfg.baseUrl);
  if (!endpoint) {
    throw Object.assign(new Error(`「${getProviderLabel(cfg.id)}」还没配置接口地址`), { status: 0 });
  }

  // 优先走 dev server 的动态中继，绕开浏览器 CORS
  try {
    const relayed = await fetch('/ai-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-endpoint': endpoint,
        'x-ai-key': cfg.apiKey.trim(),
      },
      body: payload,
    });
    if (relayed.headers.get('x-ai-proxy')) return relayed;
  } catch {
    /* 中继不可用，落到下面直连 */
  }

  // 没有中继（纯静态部署 / Electron）：直连，靠对端自身的 CORS 策略
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {}),
    },
    body: payload,
  });
}

export interface TestResult {
  ok: boolean;
  message: string;
  /** 模型实际回复的内容片段，便于确认真的通了 */
  sample?: string;
  latencyMs?: number;
}

/** 面板上的「测试连接」：发一条极短请求验证 key / 地址 / 模型是否可用 */
export async function testProvider(id: ProviderId, cfg: ProviderConfig): Promise<TestResult> {
  const invalid = validateConfig(id, cfg);
  if (invalid) return { ok: false, message: invalid };

  const started = Date.now();
  try {
    const res = await postChat(
      {
        model: cfg.model.trim() || 'lite',
        messages: [{ role: 'user', content: '回复两个字：收到' }],
        max_tokens: 32,
        temperature: 0.1,
      },
      { active: id, providers: { ...DEFAULT_SETTINGS.providers, [id]: cfg } },
    );

    const latencyMs = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        msg = parsed?.error?.message || parsed?.message || msg;
      } catch {
        if (text) msg = `${msg} ${text.slice(0, 120)}`;
      }
      // 从源头翻译成中文，避免面板还要再次拼接提示词
      return { ok: false, message: translateApiError(msg), latencyMs };
    }
    const data = JSON.parse(text);
    const sample: string = data?.choices?.[0]?.message?.content ?? '';
    return { ok: true, message: '连接成功', sample: sample.slice(0, 60), latencyMs };
  } catch (e) {
    return { ok: false, message: translateApiError((e as Error).message || String(e)), latencyMs: Date.now() - started };
  }
}

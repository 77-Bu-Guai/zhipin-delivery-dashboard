/**
 * 讯飞星火 Spark 大模型 API 封装
 * 兼容 OpenAI chat/completions 协议
 *
 * 端点:  https://spark-api-open.xf-yun.com/v1/chat/completions
 * 鉴权:  HTTP Header `Authorization: Bearer <SPARK_API_KEY>`
 * 模型:  lite（免费版）
 *
 * 密钥管理（安全）:
 *  - 浏览器/Vite 环境: 读取 import.meta.env.VITE_SPARK_API_KEY（来自 .env.local，已被 gitignore 忽略）
 *  - Node 环境（脚本/Electron main）: 读取 process.env.SPARK_API_KEY（来自 .env.local 或 shell 注入）
 *  - 绝不把 key 硬编码进源码，也绝不提交到仓库
 */

export type MiMoRole = 'system' | 'user' | 'assistant';

export interface MiMoMessage {
  role: MiMoRole;
  content: string;
}

export interface MiMoOptions {
  /** 模型名，默认 lite（免费） */
  model?: string;
  /** 采样温度，分类任务建议 0~0.3 更稳定；对话可 0.8~1.0 */
  temperature?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  topP?: number;
  /** 是否流式返回，默认 false */
  stream?: boolean;
  /** 请求超时（毫秒），默认 60s */
  timeoutMs?: number;
}

export interface MiMoResponse {
  id: string;
  model: string;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  raw: unknown;
}

const SPARK_BASE_URL = 'https://spark-api-open.xf-yun.com/v1';
const DEFAULT_MODEL = 'lite';

/** 读取密钥：优先 Vite 注入（浏览器），其次 Node 环境变量 */
function getApiKey(): string {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
    if (viteEnv?.VITE_SPARK_API_KEY) return viteEnv.VITE_SPARK_API_KEY;
  } catch {
    /* import.meta 在部分 Node 环境不可用，忽略 */
  }
  if (typeof process !== 'undefined' && process.env?.SPARK_API_KEY) {
    return process.env.SPARK_API_KEY;
  }
  return '';
}

/**
 * 调用星火大模型，返回助手文本。
 * 失败会抛出带状态码的错误，调用方需自行处理（重试/降级）。
 */
export async function callMiMo(
  messages: MiMoMessage[],
  options: MiMoOptions = {},
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'SPARK_API_KEY 未配置：请在 .env.local 设置 VITE_SPARK_API_KEY（前端）或 SPARK_API_KEY（Node）',
    );
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.3,
    maxTokens = 1024,
    topP = 0.95,
    stream = false,
    timeoutMs = 60_000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${SPARK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream,
        stop: null,
        frequency_penalty: 0,
        presence_penalty: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`星火 API 错误 ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    return content;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`星火 API 请求超时（>${timeoutMs}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用星火并返回结构化响应（含 usage、raw）。
 * 适合需要 token 统计或原始体的场景。
 */
export async function callMiMoDetailed(
  messages: MiMoMessage[],
  options: MiMoOptions = {},
): Promise<MiMoResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'SPARK_API_KEY 未配置：请在 .env.local 设置 VITE_SPARK_API_KEY（前端）或 SPARK_API_KEY（Node）',
    );
  }

  const {
    model = DEFAULT_MODEL,
    temperature = 0.3,
    maxTokens = 1024,
    topP = 0.95,
    stream = false,
    timeoutMs = 60_000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${SPARK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream,
        stop: null,
        frequency_penalty: 0,
        presence_penalty: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`星火 API 错误 ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      id: data?.id ?? '',
      model: data?.model ?? model,
      content: data?.choices?.[0]?.message?.content ?? '',
      usage: data?.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: data.usage.completion_tokens ?? 0,
            total_tokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
      raw: data,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`星火 API 请求超时（>${timeoutMs}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

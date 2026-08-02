import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import fs from 'fs';
import path from 'path';

// 从 .env.local 读取指定环境变量（仅用于 dev server 转发，绝不进入前端 bundle）
function loadEnvKey(name: string): string {
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    const m = env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm'));
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return process.env[name] || '';
}
const SPARK_KEY = loadEnvKey('SPARK_API_KEY');
const AGNES_KEY = loadEnvKey('AGNES_API_KEY');

/**
 * /ai-proxy —— 动态 AI 中继
 *
 * 前端在「AI 接口配置」面板里选好供应商后，把目标端点放在请求头 x-ai-endpoint、
 * key 放在 x-ai-key，POST 到本地的 /ai-proxy，由 Node 侧转发出去。
 * 这样用户可以在前端自由切换 本地 Ollama / 科大讯飞星火 / agnes / 任意 OpenAI 兼容接口，
 * 既绕开浏览器 CORS，也不用改任何后端代码或重启配置。
 *
 * 响应恒带 x-ai-proxy: 1，前端据此判断中继是否可用（不可用时自动回退直连）。
 */
function aiRelayPlugin(): Plugin {
  const attach = (server: ViteDevServer | { middlewares: ViteDevServer['middlewares'] }) => {
    server.middlewares.use('/ai-proxy', async (req, res) => {
      res.setHeader('x-ai-proxy', '1');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      const fail = (status: number, message: string) => {
        res.statusCode = status;
        res.end(JSON.stringify({ error: { message } }));
      };

      if (req.method !== 'POST') return fail(405, '仅支持 POST');

      const endpoint = String(req.headers['x-ai-endpoint'] || '').trim();
      if (!/^https?:\/\//i.test(endpoint)) return fail(400, '缺少或非法的 x-ai-endpoint');

      // 前端没填 key 时，按目标域名回退到 .env.local 里的 key
      let key = String(req.headers['x-ai-key'] || '').trim();
      if (!key) {
        if (/xf-yun\.com/i.test(endpoint)) key = SPARK_KEY;
        else if (/agnes/i.test(endpoint)) key = AGNES_KEY;
      }

      // 收请求体
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString('utf8');

      try {
        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body,
          signal: AbortSignal.timeout(180_000),
        });
        const text = await upstream.text();
        res.statusCode = upstream.status;
        res.end(text);
      } catch (e) {
        const msg = `[ai-relay] ${endpoint} -> ${(e as Error).message}`;
        console.error(msg);
        try {
          fs.appendFileSync(
            path.resolve(__dirname, 'proxy-error.log'),
            new Date().toISOString() + ' ' + msg + '\n'
          );
        } catch {
          /* ignore */
        }
        fail(502, `连接 AI 接口失败：${(e as Error).message}`);
      }
    });
  };

  return {
    name: 'ai-relay',
    configureServer: attach,
    configurePreviewServer: attach as unknown as Plugin['configurePreviewServer'],
  };
}

/**
 * /ai-config —— AI 接口配置的本地文件持久化
 *
 * localStorage 会因为「清浏览器缓存 / 换端口 / 换浏览器 / 无痕模式 / Electron 打包」而丢失，
 * 所以这里再落一份到项目根目录的 .ai-config.json（已 gitignore，不会提交）。
 *
 * GET  /ai-config → 返回落盘的配置（没有则 {}）
 * POST /ai-config → 原子写入（先写 .tmp 再 rename，避免中途崩溃留下半截文件）
 *
 * 前端启动时先读 localStorage 秒出 UI，再异步拉这里的文件做兜底恢复；
 * 保存时两边同时写。两份都带 updatedAt 时间戳，取新的那份，绝不会用旧配置覆盖新配置。
 */
function aiConfigStorePlugin(): Plugin {
  const FILE = path.resolve(__dirname, '.ai-config.json');

  const attach = (server: ViteDevServer | { middlewares: ViteDevServer['middlewares'] }) => {
    server.middlewares.use('/ai-config', async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('x-ai-config', '1');

      if (req.method === 'GET') {
        try {
          res.end(fs.readFileSync(FILE, 'utf8'));
        } catch {
          res.end('{}');
        }
        return;
      }

      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          JSON.parse(body); // 先校验，坏 JSON 绝不落盘，避免污染已有好配置
          const tmp = FILE + '.tmp';
          fs.writeFileSync(tmp, body, 'utf8');
          fs.renameSync(tmp, FILE); // 原子替换
          res.end(JSON.stringify({ ok: true, savedAt: Date.now() }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: (e as Error).message }));
        }
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ ok: false, message: '仅支持 GET / POST' }));
    });
  };

  return {
    name: 'ai-config-store',
    configureServer: attach,
    configurePreviewServer: attach as unknown as Plugin['configurePreviewServer'],
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,  // 绑 0.0.0.0，Chrome 扩展能用 LAN IP 访问
    port: 5173,
    strictPort: false,
    // 【兼容保留】/mimo 固定转发讯飞星火，key 由 dev server 从 .env.local 注入。
    // 前端配置面板选「科大讯飞星火」且不填 key 时走这条；scripts/ 下的 Node 脚本也依赖它。
    // 需要切换其他供应商时，前端会改走 /ai-proxy 动态中继（见上方 aiRelayPlugin）。
    proxy: {
      '/mimo': {
        target: 'https://spark-api-open.xf-yun.com',
        changeOrigin: true,
        // 跳过 TLS 证书链校验：星火网关偶尔返回的证书链在 Node 里校验不过，
        // 会导致代理转发直接 502；dev 代理仅本机使用，关闭校验安全且更稳
        secure: false,
        rewrite: (p) => p.replace(/^\/mimo/, '/v1'),
        // 星火正常响应偏慢，放宽代理超时避免被中途掐断
        timeout: 120000,
        proxyTimeout: 120000,
        headers: SPARK_KEY ? { 'Authorization': `Bearer ${SPARK_KEY}` } : {},
        configure: (proxy) => {
          // 转发失败时：打到终端 + 写本地日志 + 回明确 502（默认 vite 会吞掉并返空 500）
          proxy.on('error', (err, _req, res) => {
            const msg = `[spark-proxy] error: ${err.message}${err.code ? ' code=' + err.code : ''}`;
            console.error(msg);
            try {
              fs.appendFileSync(
                path.resolve(__dirname, 'proxy-error.log'),
                new Date().toISOString() + ' ' + msg + '\n'
              );
            } catch {
              /* ignore */
            }
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: { message: '星火代理连接失败：' + err.message } }));
            }
          });
        },
      },
    },
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('react') || id.includes('scheduler') || id.includes('zustand')) return 'react-vendor';
            if (id.includes('lucide-react')) return 'icons';
          }
        },
      },
    },
  },
  plugins: [
    aiRelayPlugin(),
    aiConfigStorePlugin(),
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths(),
    // 自定义中间件 — 直接读取 JSON 文件返回，避免 Vite 对大文件的处理问题
    {
      name: 'serve-json-files',
      configureServer(server) {
        server.middlewares.use('/extension-data.json', (_req, res) => {
          const filePath = path.resolve(__dirname, 'public', 'extension-data.json');
          try {
            const data = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end('{}');
          }
        });
        server.middlewares.use('/extension-delta.json', (_req, res) => {
          const filePath = path.resolve(__dirname, 'public', 'extension-delta.json');
          try {
            const data = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end('{}');
          }
        });
      }
    }
  ],
})
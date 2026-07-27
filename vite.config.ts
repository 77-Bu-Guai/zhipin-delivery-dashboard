import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,  // 绑 0.0.0.0，Chrome 扩展能用 LAN IP 访问
    port: 5173,
    strictPort: false,
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }), 
    tsconfigPaths(),
    // 直接把 extension-data.json 注入到 HTML 的 <script> 标签中
    // 彻底解决前端 XHR 请求失败 / zustand 轮询不生效 / Vite HMR 不更新 store 的问题
    // 每次刷新页面，数据直接内嵌在 HTML 里，不需要任何网络请求
    {
      name: 'embed-data',
      transformIndexHtml(html) {
        const filePath = path.resolve(__dirname, 'public', 'extension-data.json');
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          return html.replace(
            '</head>',
            `<script>window.__EMBEDDED_DATA__ = ${data};</script></head>`
          );
        } catch {
          return html;
        }
      }
    },
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
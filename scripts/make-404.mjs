// SPA 回退：把构建产物 dist/index.html 复制为 dist/404.html，
// 使静态托管平台在深链接刷新时回退到入口页（避免 404）。
// 用法：node scripts/make-404.mjs （通常在 vite build 之后执行）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const index = path.join(distDir, 'index.html');
const fallback = path.join(distDir, '404.html');

if (!fs.existsSync(index)) {
  console.error('未找到 dist/index.html，请先运行 vite build。');
  process.exit(1);
}
fs.copyFileSync(index, fallback);
console.log('✓ 已生成 dist/404.html（SPA 回退）');

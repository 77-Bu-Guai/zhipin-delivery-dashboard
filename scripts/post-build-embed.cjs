// 构建后脚本：将 embed-data.js 引用注入到 dist/index.html
// 改为引用外部脚本而非内联，避免 HTML 文件过大导致加载缓慢
// 用法: node scripts/post-build-embed.cjs
const fs = require('fs');
const path = require('path');

const embedSrc = path.join(__dirname, '..', 'dist', 'embed-data.js');
const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(embedSrc)) {
  console.log('⚠️  dist/embed-data.js 不存在，跳过注入');
  process.exit(0);
}

if (!fs.existsSync(indexHtml)) {
  console.log('⚠️  dist/index.html 不存在，跳过注入');
  process.exit(0);
}

let html = fs.readFileSync(indexHtml, 'utf-8');

// 检查是否已经注入过
if (html.includes('embed-data.js')) {
  console.log('ℹ️  数据脚本引用已存在，跳过');
  process.exit(0);
}

// 移除之前可能内联的 __EMBEDDED_DATA__ 脚本（如果有）
// 匹配 <script>window.__EMBEDDED_DATA__ = ... </script>
html = html.replace(/<script>window\.__EMBEDDED_DATA__\s*=.*?<\/script>\s*\n?\s*/gs, '');

// 在 <script type="module"> 之前插入 embed-data.js 引用
// 使用 defer 确保它在模块脚本之前按序执行
html = html.replace(
  /<script type="module"/,
  '<script defer src="./embed-data.js"></script>\n    <script type="module"'
);

fs.writeFileSync(indexHtml, html, 'utf-8');

const embedSizeMB = (fs.statSync(embedSrc).size / 1024 / 1024).toFixed(1);
const htmlSizeKB = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✅ 数据脚本引用已注入 index.html (${htmlSizeKB}KB, 数据文件 ${embedSizeMB}MB)`);
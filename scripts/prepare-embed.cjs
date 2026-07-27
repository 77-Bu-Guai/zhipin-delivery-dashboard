// 读取 extension-data.json，生成嵌入脚本
// 用法: node scripts/prepare-embed.cjs
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'public', 'extension-data.json');
const dst = path.join(__dirname, '..', 'public', 'embed-data.js');

if (!fs.existsSync(src)) {
  console.log('⚠️ extension-data.json 不存在，生成空数据占位');
  const empty = { 'pipeline-cache': { data: {} }, 'ai-scoring-logs': [] };
  const js = `window.__EMBEDDED_DATA__ = ${JSON.stringify(empty)};\n`;
  fs.writeFileSync(dst, js, 'utf-8');
  console.log(`✅ 已生成空数据嵌入脚本: ${dst}`);
  return;
}

const data = fs.readFileSync(src, 'utf-8');
const js = `window.__EMBEDDED_DATA__ = ${data};\n`;
fs.writeFileSync(dst, js, 'utf-8');

const sizeMB = (Buffer.byteLength(js) / 1024 / 1024).toFixed(1);
console.log(`✅ 数据嵌入脚本已生成: ${dst} (${sizeMB}MB)`);
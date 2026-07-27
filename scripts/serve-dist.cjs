// 生产环境服务器 - 提供前端静态文件和 JSON 数据接口
// 使用: node scripts/serve-dist.cjs [端口号]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 5173;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// MIME 类型映射
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  // CORS 头 - 允许外部访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;

  // JSON 数据接口 - 从 public/ 读取（实时监控脚本持续更新的文件）
  if (pathname === '/extension-data.json' || pathname === '/extension-delta.json') {
    const filePath = path.join(PUBLIC_DIR, pathname.slice(1)); // 去掉开头的 /
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('{}');
    }
    return;
  }

  // 静态文件 - 从 dist/ 读取
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(DIST_DIR, pathname);

  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA 回退: 所有未匹配路径返回 index.html
      const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(indexHtml);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.setHeader('Content-Type', mime);
    if (ext === '.json') {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  🌐 生产服务器已启动`);
  console.log(`  ─────────────────────────────`);
  console.log(`  本地访问:  http://localhost:${PORT}`);
  console.log(`  局域网访问: http://${getLocalIP()}:${PORT}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  按 Ctrl+C 停止`);
  console.log('');
});

function getLocalIP() {
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}
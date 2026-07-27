const fs = require('fs');
const path = require('path');

const desktop = path.join(process.env.USERPROFILE, 'Desktop');

function writeBat(filename, content) {
  // Ensure CRLF line endings
  const crlf = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(desktop, filename), crlf, 'utf8');
  console.log('OK: ' + filename + ' (' + crlf.length + ' bytes)');
}

writeBat('BOSS启动.bat', [
  '@echo off',
  'chcp 65001 >nul',
  'title BOSS直聘数据监控',
  'cd /d "E:\\Vibe Coding\\boss"',
  'if %ERRORLEVEL% NEQ 0 ( echo [错误] 目录不存在 & pause & exit /b 1 )',
  'node --version >nul 2>&1',
  'if %ERRORLEVEL% NEQ 0 ( echo [错误] 未找到 node & pause & exit /b 1 )',
  'echo.',
  'echo ========================================',
  'echo   BOSS直聘 - 投递数据实时监控',
  'echo ========================================',
  'echo.',
  'echo [1/2] 启动数据导出监控...',
  'start "BOSS-数据导出" cmd /c "title BOSS-数据导出 && cd /d E:\\Vibe Coding\\boss && node scripts/export-logs.cjs --watch"',
  'timeout /t 2 /nobreak >nul',
  'echo [2/2] 启动前端页面...',
  'start "BOSS-前端" cmd /c "title BOSS-前端 && cd /d E:\\Vibe Coding\\boss && npx vite --host"',
  'timeout /t 2 /nobreak >nul',
  'echo.',
  'echo   全部启动完成！',
  'echo.',
  'pause',
].join('\n'));

writeBat('BOSS实时监控.bat', [
  '@echo off',
  'chcp 65001 >nul',
  'title BOSS直聘实时数据监控',
  'cd /d "E:\\Vibe Coding\\boss"',
  'if %ERRORLEVEL% NEQ 0 ( echo [错误] 目录不存在 & pause & exit /b 1 )',
  'node --version >nul 2>&1',
  'if %ERRORLEVEL% NEQ 0 ( echo [错误] 未找到 node & pause & exit /b 1 )',
  'echo.',
  'echo ========================================',
  'echo   BOSS直聘 - 投递数据实时监控',
  'echo ========================================',
  'echo.',
  'echo 启动监控（每5秒检测浏览器新数据）...',
  'echo.',
  'node scripts/export-logs.cjs --watch',
  'echo.',
  'pause',
].join('\n'));

writeBat('BOSS一键导出.bat', [
  '@echo off',
  'chcp 65001 >nul',
  'title BOSS数据一键导出',
  'cd /d "E:\\Vibe Coding\\boss"',
  'if %ERRORLEVEL% NEQ 0 ( echo [错误] 目录不存在 & pause & exit /b 1 )',
  'node --version >nul 2>&1',
  'if %ERRORLEVEL% NEQ 0 ( echo [错误] 未找到 node & pause & exit /b 1 )',
  'echo.',
  'echo ========================================',
  'echo   BOSS数据 - 一键导出',
  'echo ========================================',
  'echo.',
  'echo 正在从浏览器读取最新数据...',
  'echo.',
  'node scripts/export-logs.cjs',
  'echo.',
  'pause',
].join('\n'));

console.log('全部完成');
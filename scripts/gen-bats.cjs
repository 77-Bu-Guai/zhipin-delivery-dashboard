const fs = require('fs');
const path = require('path');

const desktop = path.join(process.env.USERPROFILE, 'Desktop');
const projectDir = 'E:\\Vibe Coding\\boss';

function writeBat(filename, content) {
  const crlf = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(desktop, filename), crlf, 'utf8');
  console.log('OK:', filename);
}

const START_BAT = `@echo off
chcp 65001>nul
title BOSS直聘数据监控
cd /d "${projectDir}"
if errorlevel 1 (echo [错误] 目录不存在 & pause & exit /b 1)
echo.
echo ========================================
echo   BOSS直聘 - 投递数据实时监控
echo ========================================
echo.
echo [1/2] 启动数据导出监控...
start "BOSS-数据导出" "${projectDir}\\启动-数据导出.bat"
timeout /t 2 /nobreak >nul
echo [2/2] 启动前端页面...
start "BOSS-前端" "${projectDir}\\启动-前端.bat"
timeout /t 2 /nobreak >nul
echo.
echo 全部启动完成！
pause
`;

const WATCH_BAT = `@echo off
chcp 65001>nul
title BOSS直聘实时数据监控
cd /d "${projectDir}"
if errorlevel 1 (echo [错误] 目录不存在 & pause & exit /b 1)
echo.
echo ========================================
echo   BOSS直聘 - 投递数据实时监控
echo ========================================
echo.
echo 启动监控（每5秒检测浏览器新数据）...
echo.
node scripts/export-logs.cjs --watch
pause
`;

const EXPORT_BAT = `@echo off
chcp 65001>nul
title BOSS数据一键导出
cd /d "${projectDir}"
if errorlevel 1 (echo [错误] 目录不存在 & pause & exit /b 1)
echo.
echo ========================================
echo   BOSS数据 - 一键导出
echo ========================================
echo.
echo 正在从浏览器读取最新数据...
echo.
node scripts/export-logs.cjs
echo.
pause
`;

// Also create helper BATs in the project directory for the start BAT to call
const START_DATA_EXPORT = `@echo off
title BOSS-数据导出
cd /d "${projectDir}"
node scripts/export-logs.cjs --watch
`;

const START_FRONTEND = `@echo off
title BOSS-前端
cd /d "${projectDir}"
npx vite --host
`;

// Write project helper BATs
fs.writeFileSync(path.join(projectDir, '启动-数据导出.bat'), START_DATA_EXPORT.replace(/\n/g, '\r\n'), 'utf8');
fs.writeFileSync(path.join(projectDir, '启动-前端.bat'), START_FRONTEND.replace(/\n/g, '\r\n'), 'utf8');
console.log('OK: 启动-数据导出.bat');
console.log('OK: 启动-前端.bat');

// Write desktop BATs
writeBat('BOSS启动.bat', START_BAT);
writeBat('BOSS实时监控.bat', WATCH_BAT);
writeBat('BOSS一键导出.bat', EXPORT_BAT);

console.log('\n全部写入完成！');
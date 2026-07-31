@echo off
title BOSS-数据导出
cd /d "E:\Vibe Coding\boss"
set "PATH=C:\Users\86136\.workbuddy\binaries\node\versions\22.22.2;%PATH%"
:loop
node scripts/export-logs.cjs --watch --compact
echo.
echo ====== 进程退出，5秒后自动重启 ======
timeout /t 5 >nul
goto loop

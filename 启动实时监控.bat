@echo off
title BOSS直聘实时数据监控
cd /d "%~dp0"

echo ========================================
echo   BOSS直聘 - 投递数据实时监控
echo ========================================
echo.
echo   - 每 5 秒检测 Chrome/Firefox 浏览器新数据
echo   - AI 评分日志自动读取（两个浏览器）
echo   - 前端页面自动刷新（每 10 秒）
echo   - 关闭此窗口停止监控
echo ========================================
echo.

:: 检查 node
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 node，请先安装 Node.js
    pause
    exit /b 1
)

echo 启动数据导出监控...
echo.
node scripts/export-logs.cjs --watch
echo.
pause
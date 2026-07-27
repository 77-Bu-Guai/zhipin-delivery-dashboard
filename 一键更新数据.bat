@echo off
title BOSS数据一键导出
cd /d "%~dp0"

echo ========================================
echo   BOSS数据 - 一键导出
echo ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 node
    pause
    exit /b 1
)

echo 正在从浏览器读取最新数据（含 AI 评分）...
echo.
node scripts/export-logs.cjs
echo.
echo   按任意键关闭
pause >nul
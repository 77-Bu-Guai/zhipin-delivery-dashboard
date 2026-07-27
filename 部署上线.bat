@echo off
title BOSS 部署上线
cd /d "%~dp0"

echo ========================================
echo   BOSS 直聘 - 部署上线
echo ========================================
echo.

:: Step 1: 构建前端
echo [1/2] 构建前端项目...
call npx vite build
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 构建失败！
    pause
    exit /b 1
)
echo [完成] 前端构建成功
echo.

:: Step 2: 打开预览
echo [2/2] 启动本地预览...
echo.
echo   预览地址：http://localhost:4173
echo   按 Ctrl+C 停止
echo.
call npx vite preview --host
pause

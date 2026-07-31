@echo off
title BOSS直聘 - 一键启动
cd /d "%~dp0"
set "PATH=C:\Users\86136\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

echo ========================================
echo   BOSS直聘 - 一键启动
echo ========================================
echo.

:: Step 1: 先做一次全量数据更新
echo [1/3] 正在从浏览器导出最新数据...
node scripts/export-logs.cjs --compact
if %ERRORLEVEL% NEQ 0 (
    echo [警告] 数据导出异常，继续启动...
)
echo.

:: Step 2: 启动数据监听 + 前端
echo [2/3] 启动实时监听 + 前端页面...
start "BOSS-数据导出" /D "%~dp0" cmd /c 启动-数据导出.bat
start "BOSS-前端" /D "%~dp0" cmd /c 启动-前端.bat

echo [3/3] 全部启动完成！
echo.
echo   ========================================
echo    数据导出窗口 - 后台运行，每60秒同步
echo    前端页面     - http://localhost:5173
echo   ========================================
echo.
echo   关闭此窗口不影响后台运行
pause

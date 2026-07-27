@echo off
title BOSS 直聘数据监控 - 主控台
cd /d "%~dp0"

echo ========================================
echo   BOSS 直聘 - 投递数据实时监控
echo   数据导出每 60 秒检查一次
echo ========================================
echo.

start "BOSS-数据导出" /D "%~dp0" cmd /k 启动-数据导出.bat
start "BOSS-前端" /D "%~dp0" cmd /k 启动-前端.bat

echo ========================================
echo   全部启动完成！
echo     数据导出 → 新窗口（挂了自动重启）
echo     前端页面 → 新窗口（http://localhost:5173）
echo ========================================
echo.
echo   此窗口可以关闭，不影响后台服务
pause

@echo off
title BOSS����һ������
cd /d "%~dp0"
set "PATH=C:\Users\86136\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

echo ========================================
echo   BOSS���� - һ������
echo ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [����] δ�ҵ� node
    pause
    exit /b 1
)

echo ���ڴ��������ȡ�������ݣ��� AI ���֣�...
echo.
node scripts/export-logs.cjs
echo.
echo   ��������ر�
pause >nul
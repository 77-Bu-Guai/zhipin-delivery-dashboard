@echo off
title BOSSֱƸʵʱ���ݼ��
cd /d "%~dp0"
set "PATH=C:\Users\86136\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

echo ========================================
echo   BOSSֱƸ - Ͷ������ʵʱ���
echo ========================================
echo.
echo   - ÿ 5 ���� Chrome/Firefox �����������
echo   - AI ������־�Զ���ȡ�������������
echo   - ǰ��ҳ���Զ�ˢ�£�ÿ 10 �룩
echo   - �رմ˴���ֹͣ���
echo ========================================
echo.

:: ��� node
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [����] δ�ҵ� node�����Ȱ�װ Node.js
    pause
    exit /b 1
)

echo �������ݵ������...
echo.
node scripts/export-logs.cjs --watch
echo.
pause
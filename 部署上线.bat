@echo off
title BOSS ��������
cd /d "%~dp0"
set "PATH=C:\Users\86136\.workbuddy\binaries\node\versions\22.22.2;%PATH%"

echo ========================================
echo   BOSS ֱƸ - ��������
echo ========================================
echo.

:: Step 1: ����ǰ��
echo [1/2] ����ǰ����Ŀ...
call npx vite build
if %ERRORLEVEL% NEQ 0 (
    echo [����] ����ʧ�ܣ�
    pause
    exit /b 1
)
echo [���] ǰ�˹����ɹ�
echo.

:: Step 2: ��Ԥ��
echo [2/2] ��������Ԥ��...
echo.
echo   Ԥ����ַ��http://localhost:4173
echo   �� Ctrl+C ֹͣ
echo.
call npx vite preview --host
pause

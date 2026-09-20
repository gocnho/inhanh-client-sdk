@echo off
title INHANH API - Client Kit Launcher
echo ===================================================
echo   INHANH API - Client SDK ^& Viewer (2D / 3D / Imp)
echo ===================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Dang khoi dong may chu Proxy Node.js tai http://localhost:8080 ...
    start http://localhost:8080
    node server.js
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Dang khoi dong Python Server tai http://localhost:8080 ...
    start http://localhost:8080
    python -m http.server 8080
    goto end
)

echo Khong tim thay Node.js hoac Python tren may.
echo Dang mo index.html...
start index.html

:end
pause

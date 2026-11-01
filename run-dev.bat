@echo off
title MediVault Dev Server
echo ===================================================
echo            Starting MediVault System
echo ===================================================

cd /d "%~dp0"

echo [1/2] Starting Python FastAPI Backend on port 8000 (accessible on Wi-Fi/LAN)...
start "MediVault Backend (FastAPI)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Starting React Vite Frontend on port 5173 (accessible on Wi-Fi/LAN)...
start "MediVault Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm.cmd run dev -- --host 0.0.0.0 --port 5173"

echo.
echo ---------------------------------------------------
echo Servers starting up!
echo   * Local App: http://localhost:5173
echo   * Local API: http://localhost:8000
echo   * Mobile QR scans on the same Wi-Fi will work seamlessly!
echo ---------------------------------------------------
timeout /t 3 >nul
start http://127.0.0.1:5173/login

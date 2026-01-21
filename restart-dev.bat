@echo off
REM Restart Development Servers Script (Windows Batch)
REM Kills all Node.js processes and restarts backend and frontend

echo.
echo ================================================
echo    Restarting Development Servers
echo ================================================
echo.

REM Step 1: Kill all Node.js processes
echo [STOP] Killing all Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js processes stopped
) else (
    echo [INFO] No Node.js processes were running
)

echo.
timeout /t 2 /nobreak >nul

REM Step 2: Start Backend
echo [START] Starting Backend Server...
cd /d "%~dp0backend"
if exist "package.json" (
    start "Backend Server" cmd /k "npm run dev"
    echo [OK] Backend server started in new window
) else (
    echo [ERROR] Backend directory not found
)

echo.
timeout /t 2 /nobreak >nul

REM Step 3: Start Frontend
echo [START] Starting Frontend Server...
cd /d "%~dp0web"
if exist "package.json" (
    start "Frontend Server" cmd /k "npm run dev"
    echo [OK] Frontend server started in new window
) else (
    echo [ERROR] Frontend directory not found
)

REM Return to project root
cd /d "%~dp0"

echo.
echo ================================================
echo    Development Servers Restarted!
echo ================================================
echo.
echo Servers:
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo.
echo Press any key to close this window...
pause >nul

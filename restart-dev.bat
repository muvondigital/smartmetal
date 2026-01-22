@echo off
echo ========================================
echo   SmartMetal CPQ - Restart Dev Services
echo ========================================
echo.

:: Kill any existing Node processes on the relevant ports
echo Stopping existing services...

:: Kill processes on port 4000 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000" ^| findstr "LISTENING"') do (
    echo Killing process on port 4000 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

:: Kill processes on port 5173 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo Killing process on port 5173 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

:: Small delay to ensure ports are released
timeout /t 2 /nobreak >nul

echo.
echo Starting services...
echo.

:: Start backend in a new window
echo Starting Backend (port 4000)...
start "SmartMetal Backend" cmd /k "cd /d %~dp0backend && npm run dev"

:: Small delay before starting frontend
timeout /t 3 /nobreak >nul

:: Start frontend in a new window
echo Starting Frontend (port 5173)...
start "SmartMetal Frontend" cmd /k "cd /d %~dp0web && npm run dev"

echo.
echo ========================================
echo   Services are starting!
echo ========================================
echo.
echo   Backend:  http://localhost:4000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:4000/api/docs
echo.
echo Press any key to exit this window...
pause >nul

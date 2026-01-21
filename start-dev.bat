@echo off
REM SmartMetal Local Development Startup Script
REM Starts both backend and frontend servers

echo ========================================
echo  SmartMetal - Local Development Server
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Checking Node.js version...
node --version
echo.

REM Check if dependencies are installed
echo [2/4] Checking dependencies...
if not exist "backend\node_modules\" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

if not exist "web\node_modules\" (
    echo Installing frontend dependencies...
    cd web
    call npm install
    cd ..
)
echo Dependencies OK
echo.

REM Check if .env files exist
echo [3/4] Checking configuration files...
if not exist "backend\.env" (
    echo WARNING: backend\.env not found
    echo Please create backend\.env with your configuration
    pause
    exit /b 1
)

if not exist "web\.env" (
    echo WARNING: web\.env not found
    echo Creating web\.env with default settings...
    echo VITE_API_BASE_URL=http://localhost:3001/api > web\.env
)
echo Configuration OK
echo.

echo [4/4] Starting servers...
echo.
echo ----------------------------------------
echo  Backend:  http://localhost:3001
echo  Frontend: http://localhost:5173
echo ----------------------------------------
echo.
echo Press Ctrl+C to stop all servers
echo.

REM Start backend in new window (keeps window open)
start "SmartMetal Backend (Port 3001)" cmd /k "cd backend && npm start"

REM Wait a bit for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window (keeps window open)
start "SmartMetal Frontend (Port 5173)" cmd /k "cd web && npm run dev"

echo.
echo ========================================
echo  Servers are starting...
echo  Check the new windows for status
echo ========================================
echo.
echo Demo Login Credentials (ALL passwords: password123):
echo.
echo   MetaSteel (Demo):
echo     Email: admin@metasteel.com
echo     Password: password123
echo.
echo   NSC Sinergi (Manager with Approval Rights):
echo     Email: Sales07@nscsinergi.com.my
echo     Password: password123
echo     Tenant: NSC
echo.
echo NOTE: Backend and Frontend windows will STAY OPEN
echo       so you can monitor logs and see what's happening.
echo       To stop servers, close those terminal windows or press Ctrl+C in them.
echo.
echo Press any key to close THIS launcher window
echo (Servers will continue running in their own windows)
pause >nul

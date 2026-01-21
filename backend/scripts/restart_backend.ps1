# Restart Backend Server Script
# Finds and kills the Node.js process on port 4000, then restarts it

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Restarting Backend Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find process on port 4000
$connections = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($connections) {
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $processIds) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -eq 'node') {
            Write-Host "Stopping Node.js process (PID: $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Write-Host "✓ Process stopped" -ForegroundColor Green
        }
    }
} else {
    Write-Host "No process found on port 4000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting backend server..." -ForegroundColor Blue
Write-Host ""

# Start backend server
$backendPath = Join-Path $PSScriptRoot ".."
Set-Location $backendPath

# Start in background job or new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; Write-Host 'Starting Backend Server...' -ForegroundColor Blue; npm run dev"

Write-Host "✓ Backend server starting..." -ForegroundColor Green
Write-Host ""
Write-Host "Waiting for server to start..." -ForegroundColor Cyan

# Wait for server to start
$maxAttempts = 30
$attempt = 0
do {
    Start-Sleep -Seconds 1
    $attempt++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ Backend server is running!" -ForegroundColor Green
            exit 0
        }
    } catch {
        # Server not ready yet
    }
} while ($attempt -lt $maxAttempts)

Write-Host "⚠ Backend server may still be starting..." -ForegroundColor Yellow
Write-Host "Check the server window for status." -ForegroundColor Yellow


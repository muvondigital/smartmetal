#!/usr/bin/env pwsh
# Restart Development Servers Script
# Kills all Node.js processes and restarts backend and frontend

Write-Host "🔄 Restarting Development Servers..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill all Node.js processes
Write-Host "🛑 Stopping all Node.js processes..." -ForegroundColor Yellow
try {
    $nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        $nodeProcesses | Stop-Process -Force
        Write-Host "✅ Stopped $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  No Node.js processes running" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Error stopping processes: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 2

# Step 2: Start Backend
Write-Host "🚀 Starting Backend Server..." -ForegroundColor Cyan
try {
    $backendPath = Join-Path $PSScriptRoot "backend"
    if (Test-Path $backendPath) {
        Set-Location $backendPath
        Start-Process pwsh -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal
        Write-Host "✅ Backend server started in new window" -ForegroundColor Green
    } else {
        Write-Host "❌ Backend directory not found: $backendPath" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Failed to start backend: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 2

# Step 3: Start Frontend
Write-Host "🚀 Starting Frontend Server..." -ForegroundColor Cyan
try {
    $frontendPath = Join-Path $PSScriptRoot "web"
    if (Test-Path $frontendPath) {
        Set-Location $frontendPath
        Start-Process pwsh -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal
        Write-Host "✅ Frontend server started in new window" -ForegroundColor Green
    } else {
        Write-Host "❌ Frontend directory not found: $frontendPath" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Failed to start frontend: $_" -ForegroundColor Red
}

# Return to project root
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "✅ Development servers restarted!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Servers:" -ForegroundColor Cyan
Write-Host "   Backend:  http://localhost:3001" -ForegroundColor White
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor White
Write-Host ""

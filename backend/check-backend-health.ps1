# Backend Health Check Script
Write-Host "=== Backend Connection Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
Write-Host "1. Checking if port 4000 is in use..." -ForegroundColor Yellow
$port4000 = netstat -ano | findstr :4000
if ($port4000) {
    Write-Host "   ✓ Port 4000 is in use" -ForegroundColor Green
    $port4000 | ForEach-Object { Write-Host "   $_" }
} else {
    Write-Host "   ✗ Port 4000 is NOT in use - Backend is not running!" -ForegroundColor Red
    Write-Host "   Start it with: cd backend && npm run dev" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""

# Test health endpoint
Write-Host "2. Testing backend health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri http://localhost:4000/health -TimeoutSec 5
    Write-Host "   ✓ Backend health check passed" -ForegroundColor Green
    Write-Host "   Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Backend health check failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host ""

# Test API endpoint (expecting 401 for auth)
Write-Host "3. Testing API endpoint accessibility..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri http://localhost:4000/api/rfqs -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   ✓ API endpoint is accessible" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   ✓ API endpoint is accessible (401 = auth required, which is expected)" -ForegroundColor Green
    } elseif ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "   ⚠ API endpoint returned 404 (route might not exist)" -ForegroundColor Yellow
    } else {
        Write-Host "   ✗ API endpoint test failed" -ForegroundColor Red
        Write-Host "   Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Frontend Configuration Check ===" -ForegroundColor Cyan
Write-Host ""

# Check frontend .env.local
$frontendEnvPath = "..\web\.env.local"
if (Test-Path $frontendEnvPath) {
    Write-Host "✓ Frontend .env.local found:" -ForegroundColor Green
    Get-Content $frontendEnvPath | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "⚠ Frontend .env.local NOT found" -ForegroundColor Yellow
    Write-Host "  Using default: http://localhost:4000/api" -ForegroundColor Gray
    Write-Host "  To customize, create web/.env.local with:" -ForegroundColor Yellow
    Write-Host "    VITE_API_BASE_URL=http://localhost:4000/api" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Backend Status: RUNNING" -ForegroundColor Green
Write-Host ""
Write-Host "If frontend still can't connect:" -ForegroundColor Yellow
Write-Host "1. Check browser console (F12) for specific errors" -ForegroundColor White
Write-Host "2. Verify VITE_API_BASE_URL in web/.env.local matches backend port" -ForegroundColor White
Write-Host "3. Clear browser cache and hard refresh (Ctrl+Shift+R)" -ForegroundColor White
Write-Host "4. Restart frontend dev server after changing .env.local" -ForegroundColor White
Write-Host ""

# ngrok Authtoken Setup Script
# Helps you configure ngrok authentication

Write-Host "`n🔐 ngrok Authtoken Setup" -ForegroundColor Cyan
Write-Host "=======================`n" -ForegroundColor Cyan

Write-Host "ngrok v3 requires an authtoken to work.`n" -ForegroundColor Yellow

Write-Host "Step 1: Get your authtoken" -ForegroundColor Green
Write-Host "   1. Visit: https://dashboard.ngrok.com/signup" -ForegroundColor White
Write-Host "      (Sign up for a free account if you don't have one)" -ForegroundColor Gray
Write-Host "   2. After login, go to: https://dashboard.ngrok.com/get-started/your-authtoken" -ForegroundColor White
Write-Host "   3. Copy your authtoken`n" -ForegroundColor White

$authtoken = Read-Host "Step 2: Enter your ngrok authtoken"

if ($authtoken -and $authtoken.Trim()) {
    $authtoken = $authtoken.Trim()
    Write-Host "`n🔧 Configuring ngrok with authtoken...`n" -ForegroundColor Cyan
    
    $ngrokPath = "C:\ngrok\ngrok.exe"
    if (Test-Path $ngrokPath) {
        try {
            & $ngrokPath config add-authtoken $authtoken
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n✅ Authtoken configured successfully!`n" -ForegroundColor Green
                
                Write-Host "Step 3: Starting ngrok..." -ForegroundColor Green
                Write-Host "   This will open a new window with ngrok running`n" -ForegroundColor Gray
                
                Start-Process -FilePath $ngrokPath -ArgumentList "http","3001" -WindowStyle Normal
                Start-Sleep -Seconds 5
                
                Write-Host "✅ ngrok started! Check the ngrok window for the HTTPS URL.`n" -ForegroundColor Green
                Write-Host "📋 Next: Once you see the HTTPS URL in the ngrok window," -ForegroundColor Yellow
                Write-Host "   run: .\add-ngrok-url.ps1" -ForegroundColor White
                Write-Host "   Or provide the URL and we'll add it automatically.`n" -ForegroundColor White
            } else {
                Write-Host "❌ Failed to configure authtoken. Please check the token and try again." -ForegroundColor Red
            }
        } catch {
            Write-Host "❌ Error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ ngrok.exe not found at: $ngrokPath" -ForegroundColor Red
    }
} else {
    Write-Host "❌ No authtoken provided" -ForegroundColor Red
}


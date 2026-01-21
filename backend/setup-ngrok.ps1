# ngrok Setup Script for Cloud Tasks Integration
# Downloads and sets up ngrok for local HTTPS tunneling

Write-Host "`n🔧 ngrok Setup for Cloud Tasks" -ForegroundColor Cyan
Write-Host "==============================`n" -ForegroundColor Cyan

$ngrokDir = "C:\ngrok"
$ngrokExe = Join-Path $ngrokDir "ngrok.exe"
$downloadUrl = "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"

# Check if ngrok already exists
if (Test-Path $ngrokExe) {
    Write-Host "✅ ngrok already exists at: $ngrokExe" -ForegroundColor Green
    $ngrokPath = $ngrokExe
} else {
    Write-Host "📥 Downloading ngrok..." -ForegroundColor Yellow
    
    # Create directory if it doesn't exist
    if (-not (Test-Path $ngrokDir)) {
        New-Item -ItemType Directory -Path $ngrokDir -Force | Out-Null
        Write-Host "✅ Created directory: $ngrokDir" -ForegroundColor Green
    }
    
    $zipPath = Join-Path $env:TEMP "ngrok.zip"
    
    try {
        # Download ngrok
        Write-Host "   Downloading from: $downloadUrl" -ForegroundColor Gray
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
        Write-Host "✅ Download complete" -ForegroundColor Green
        
        # Extract ngrok.exe
        Write-Host "   Extracting ngrok.exe..." -ForegroundColor Gray
        Expand-Archive -Path $zipPath -DestinationPath $ngrokDir -Force
        Write-Host "✅ Extraction complete" -ForegroundColor Green
        
        # Clean up zip file
        Remove-Item $zipPath -Force
        
        if (Test-Path $ngrokExe) {
            Write-Host "✅ ngrok installed successfully at: $ngrokExe" -ForegroundColor Green
            $ngrokPath = $ngrokExe
        } else {
            Write-Host "❌ ngrok.exe not found after extraction" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "❌ Failed to download ngrok: $_" -ForegroundColor Red
        Write-Host "`n📋 Manual Installation:" -ForegroundColor Yellow
        Write-Host "   1. Visit: https://ngrok.com/download" -ForegroundColor White
        Write-Host "   2. Download Windows version" -ForegroundColor White
        Write-Host "   3. Extract ngrok.exe to: $ngrokDir" -ForegroundColor White
        exit 1
    }
}

# Start ngrok
Write-Host "`n🚀 Starting ngrok tunnel to localhost:3001..." -ForegroundColor Cyan
Write-Host "   (This will open a new window)" -ForegroundColor Gray

try {
    Start-Process -FilePath $ngrokPath -ArgumentList "http","3001" -WindowStyle Normal
    Write-Host "✅ ngrok started in a new window" -ForegroundColor Green
    
    Write-Host "`n⏳ Waiting for ngrok to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 8
    
    # Try to get the URL from ngrok API
    $maxRetries = 10
    $retryCount = 0
    $httpsUrl = $null
    
    while ($retryCount -lt $maxRetries -and -not $httpsUrl) {
        try {
            $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 2 -ErrorAction Stop
            if ($response.tunnels -and $response.tunnels.Count -gt 0) {
                $tunnel = $response.tunnels | Where-Object { 
                    $_.proto -eq 'https' -and $_.config.addr -like '*:3001' 
                } | Select-Object -First 1
                
                if ($tunnel -and $tunnel.public_url) {
                    $httpsUrl = $tunnel.public_url
                    break
                }
            }
        } catch {
            # API not ready yet
        }
        
        $retryCount++
        if ($retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 2
        }
    }
    
    if ($httpsUrl) {
        Write-Host "✅ Found ngrok HTTPS URL: $httpsUrl" -ForegroundColor Green
        
        $targetUrl = "$httpsUrl/api/ai/process-extraction-task"
        Write-Host "`n📝 Target URL: $targetUrl" -ForegroundColor Cyan
        
        # Update .env.gcp
        $envGcpPath = Join-Path $PSScriptRoot ".env.gcp"
        if (Test-Path $envGcpPath) {
            $content = Get-Content $envGcpPath -Raw
            
            # Remove existing CLOUDTASKS_TARGET_URL if present
            $content = $content -replace "(?m)^CLOUDTASKS_TARGET_URL=.*$", ""
            
            # Add new CLOUDTASKS_TARGET_URL after CLOUDTASKS_EXTRACTION_QUEUE
            if ($content -match "CLOUDTASKS_EXTRACTION_QUEUE") {
                $content = $content -replace "(CLOUDTASKS_EXTRACTION_QUEUE=.*)", "`$1`nCLOUDTASKS_TARGET_URL=$targetUrl"
            } else {
                # Add to end of file
                $content = $content.Trim() + "`nCLOUDTASKS_TARGET_URL=$targetUrl"
            }
            
            Set-Content $envGcpPath -Value $content.Trim()
            Write-Host "`n✅ Updated .env.gcp with CLOUDTASKS_TARGET_URL" -ForegroundColor Green
            Write-Host "   Value: $targetUrl" -ForegroundColor Gray
            
            Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
            Write-Host "   1. ✅ ngrok is running (keep the window open)" -ForegroundColor Green
            Write-Host "   2. ✅ CLOUDTASKS_TARGET_URL added to .env.gcp" -ForegroundColor Green
            Write-Host "   3. ⏳ Restart your backend to load the new configuration" -ForegroundColor Yellow
            Write-Host "   4. ⏳ Test with: node test-cloud-tasks-extraction.js`n" -ForegroundColor Yellow
        } else {
            Write-Host "`n⚠️  .env.gcp not found at: $envGcpPath" -ForegroundColor Yellow
            Write-Host "   Please manually add to .env.gcp:" -ForegroundColor White
            Write-Host "   CLOUDTASKS_TARGET_URL=$targetUrl" -ForegroundColor Gray
        }
    } else {
        Write-Host "`n⚠️  Could not automatically detect ngrok URL" -ForegroundColor Yellow
        Write-Host "   Please check the ngrok window and look for:" -ForegroundColor White
        Write-Host "   Forwarding  https://xxxxx.ngrok-free.app -> http://localhost:3001" -ForegroundColor Gray
        Write-Host "`n   Then manually add to .env.gcp:" -ForegroundColor White
        Write-Host "   CLOUDTASKS_TARGET_URL=https://xxxxx.ngrok-free.app/api/ai/process-extraction-task" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "❌ Failed to start ngrok: $_" -ForegroundColor Red
    Write-Host "`n📋 Manual Start:" -ForegroundColor Yellow
    Write-Host "   Run: $ngrokPath http 3001" -ForegroundColor White
    exit 1
}

Write-Host "`n✅ ngrok setup complete!`n" -ForegroundColor Green


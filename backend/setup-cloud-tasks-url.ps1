# Cloud Tasks URL Setup Helper
# This script helps you set up the CLOUDTASKS_TARGET_URL for Cloud Tasks integration

Write-Host "`n🔧 Cloud Tasks HTTPS URL Setup" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

Write-Host "Cloud Tasks requires an HTTPS URL when using OIDC authentication.`n" -ForegroundColor Yellow

# Check if ngrok is available
$ngrokAvailable = $false
try {
    $ngrokVersion = ngrok version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ngrokAvailable = $true
        Write-Host "✅ ngrok is installed" -ForegroundColor Green
        Write-Host "   Version: $ngrokVersion`n" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ ngrok is not installed" -ForegroundColor Red
    Write-Host "   Download from: https://ngrok.com/download`n" -ForegroundColor Gray
}

Write-Host "Options for setting up HTTPS URL:`n" -ForegroundColor White

if ($ngrokAvailable) {
    Write-Host "Option 1: Use ngrok (Recommended for local testing)" -ForegroundColor Green
    Write-Host "  1. In a new terminal, run: ngrok http 3001" -ForegroundColor Gray
    Write-Host "  2. Copy the 'Forwarding' HTTPS URL (e.g., https://abc123.ngrok.io)" -ForegroundColor Gray
    Write-Host "  3. Press Enter here when you have the URL..." -ForegroundColor Gray
    $ngrokUrl = Read-Host "  Enter ngrok HTTPS URL (without /api/ai/process-extraction-task)"
    
    if ($ngrokUrl) {
        $targetUrl = "$ngrokUrl/api/ai/process-extraction-task"
        Write-Host "`n✅ Target URL: $targetUrl" -ForegroundColor Green
        
        # Update .env.gcp
        $envGcpPath = Join-Path $PSScriptRoot ".env.gcp"
        if (Test-Path $envGcpPath) {
            $content = Get-Content $envGcpPath -Raw
            
            # Remove existing CLOUDTASKS_TARGET_URL if present
            $content = $content -replace "(?m)^CLOUDTASKS_TARGET_URL=.*$", ""
            
            # Add new CLOUDTASKS_TARGET_URL
            if ($content -notmatch "CLOUDTASKS_TARGET_URL") {
                # Add after CLOUDTASKS_EXTRACTION_QUEUE
                $content = $content -replace "(CLOUDTASKS_EXTRACTION_QUEUE=.*)", "`$1`nCLOUDTASKS_TARGET_URL=$targetUrl"
            } else {
                $content += "`nCLOUDTASKS_TARGET_URL=$targetUrl"
            }
            
            Set-Content $envGcpPath -Value $content.Trim()
            Write-Host "✅ Updated .env.gcp with CLOUDTASKS_TARGET_URL" -ForegroundColor Green
            Write-Host "`n⚠️  Don't forget to restart your backend!`n" -ForegroundColor Yellow
        } else {
            Write-Host "❌ .env.gcp not found at: $envGcpPath" -ForegroundColor Red
        }
    }
} else {
    Write-Host "Option 1: Install and use ngrok" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://ngrok.com/download" -ForegroundColor Gray
    Write-Host "  2. Extract and add to PATH" -ForegroundColor Gray
    Write-Host "  3. Run: ngrok http 3001" -ForegroundColor Gray
    Write-Host "  4. Copy the HTTPS URL and add to .env.gcp`n" -ForegroundColor Gray
}

Write-Host "Option 2: Use deployed service URL" -ForegroundColor Yellow
Write-Host "  If you have a Cloud Run or other HTTPS service deployed," -ForegroundColor Gray
Write-Host "  provide the URL and we'll add it to .env.gcp`n" -ForegroundColor Gray

$deployedUrl = Read-Host "Enter deployed service URL (or press Enter to skip)"
if ($deployedUrl) {
    if (-not $deployedUrl.StartsWith("https://")) {
        $deployedUrl = "https://$deployedUrl"
    }
    if (-not $deployedUrl.EndsWith("/api/ai/process-extraction-task")) {
        $deployedUrl = $deployedUrl.TrimEnd('/') + "/api/ai/process-extraction-task"
    }
    
    Write-Host "`n✅ Target URL: $deployedUrl" -ForegroundColor Green
    
    # Update .env.gcp
    $envGcpPath = Join-Path $PSScriptRoot ".env.gcp"
    if (Test-Path $envGcpPath) {
        $content = Get-Content $envGcpPath -Raw
        
        # Remove existing CLOUDTASKS_TARGET_URL if present
        $content = $content -replace "(?m)^CLOUDTASKS_TARGET_URL=.*$", ""
        
        # Add new CLOUDTASKS_TARGET_URL
        if ($content -notmatch "CLOUDTASKS_TARGET_URL") {
            # Add after CLOUDTASKS_EXTRACTION_QUEUE
            $content = $content -replace "(CLOUDTASKS_EXTRACTION_QUEUE=.*)", "`$1`nCLOUDTASKS_TARGET_URL=$deployedUrl"
        } else {
            $content += "`nCLOUDTASKS_TARGET_URL=$deployedUrl"
        }
        
        Set-Content $envGcpPath -Value $content.Trim()
        Write-Host "✅ Updated .env.gcp with CLOUDTASKS_TARGET_URL" -ForegroundColor Green
        Write-Host "`n⚠️  Don't forget to restart your backend!`n" -ForegroundColor Yellow
    } else {
        Write-Host "❌ .env.gcp not found at: $envGcpPath" -ForegroundColor Red
    }
}

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Restart your backend to load the new CLOUDTASKS_TARGET_URL" -ForegroundColor White
Write-Host "  2. Test extraction with async=true" -ForegroundColor White
Write-Host "  3. Check Cloud Tasks console for task creation`n" -ForegroundColor White


# Quick script to add ngrok URL to .env.gcp

Write-Host "`n🔧 Add ngrok URL to Cloud Tasks Configuration" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "Please check your ngrok window and find the HTTPS URL." -ForegroundColor Yellow
Write-Host "Look for a line like:" -ForegroundColor White
Write-Host "   Forwarding  https://abc123.ngrok-free.app -> http://localhost:3001`n" -ForegroundColor Gray

$ngrokUrl = Read-Host "Enter the ngrok HTTPS URL (without /api/ai/process-extraction-task)"

if ($ngrokUrl) {
    # Clean up the URL
    $ngrokUrl = $ngrokUrl.Trim()
    if (-not $ngrokUrl.StartsWith("https://")) {
        $ngrokUrl = "https://$ngrokUrl"
    }
    $ngrokUrl = $ngrokUrl.TrimEnd('/')
    
    $targetUrl = "$ngrokUrl/api/ai/process-extraction-task"
    
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
        
        # Validate
        Write-Host "`n🔍 Validating configuration..." -ForegroundColor Cyan
        node validate-cloud-tasks-setup.js
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✅ Configuration complete! Next steps:" -ForegroundColor Green
            Write-Host "   1. Restart your backend" -ForegroundColor White
            Write-Host "   2. Test with: node test-cloud-tasks-extraction.js`n" -ForegroundColor White
        }
    } else {
        Write-Host "❌ .env.gcp not found at: $envGcpPath" -ForegroundColor Red
    }
} else {
    Write-Host "❌ No URL provided" -ForegroundColor Red
}


# Add custom domain to Cloudflare Pages project (run after successful deployment)

$ErrorActionPreference = "Stop"

Write-Host "Adding Custom Domain to Cloudflare Pages" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cloudflare credentials
$CLOUDFLARE_API_TOKEN = "EjiG9ZjtEbmpp7FQPxsFQZAxt1EzoF-zGbFOyj2l"
$CLOUDFLARE_ACCOUNT_ID = "f42f0c63d485c9363d1d62042f9c3658"
$PROJECT_NAME = "smartmetal-cpq-web"
$CUSTOM_DOMAIN = "smartmetal.muvondigital.my"

# API headers
$headers = @{
    "Authorization" = "Bearer $CLOUDFLARE_API_TOKEN"
    "Content-Type" = "application/json"
}

try {
    Write-Host "Checking if project exists..." -ForegroundColor Yellow
    $projectUrl = "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME"
    
    $project = Invoke-RestMethod -Uri $projectUrl -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "[OK] Project found!" -ForegroundColor Green

    Write-Host ""
    Write-Host "Checking existing custom domains..." -ForegroundColor Yellow
    $domainsUrl = "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains"
    $existingDomains = Invoke-RestMethod -Uri $domainsUrl -Method Get -Headers $headers -ErrorAction SilentlyContinue
    
    if ($existingDomains.result -and $existingDomains.result.Count -gt 0) {
        Write-Host "   Existing domains:" -ForegroundColor Gray
        foreach ($domain in $existingDomains.result) {
            Write-Host "   - $($domain.domain)" -ForegroundColor Gray
            if ($domain.domain -eq $CUSTOM_DOMAIN) {
                Write-Host "[OK] Custom domain '$CUSTOM_DOMAIN' already configured!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Your site is available at: https://$CUSTOM_DOMAIN" -ForegroundColor Cyan
                exit 0
            }
        }
    }

    Write-Host ""
    Write-Host "Adding custom domain: $CUSTOM_DOMAIN" -ForegroundColor Yellow
    $body = @{
        domain = $CUSTOM_DOMAIN
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri $domainsUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
    
    if ($result.success) {
        Write-Host "[OK] Custom domain added successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Your SmartMetal CPQ is now live at:" -ForegroundColor Cyan
        Write-Host "   https://$CUSTOM_DOMAIN" -ForegroundColor Green
        Write-Host ""
        Write-Host "Note: DNS propagation and SSL certificate provisioning may take a few minutes." -ForegroundColor Yellow
    }
    else {
        Write-Host "[ERROR] Failed to add custom domain" -ForegroundColor Red
        Write-Host "   Error: $($result.errors | ConvertTo-Json)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "[ERROR] Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Make sure:" -ForegroundColor Yellow
    Write-Host "   1. The Pages project '$PROJECT_NAME' exists (deployment must succeed first)" -ForegroundColor Gray
    Write-Host "   2. The domain '$CUSTOM_DOMAIN' is added to your Cloudflare account" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green

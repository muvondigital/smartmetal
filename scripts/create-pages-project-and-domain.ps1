# Create Cloudflare Pages project and add custom domain

$ErrorActionPreference = "Stop"

Write-Host "Creating Cloudflare Pages Project and Custom Domain" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
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
    # Check if project exists
    Write-Host "Checking if project exists..." -ForegroundColor Yellow
    $projectUrl = "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME"
    
    try {
        $project = Invoke-RestMethod -Uri $projectUrl -Method Get -Headers $headers -ErrorAction Stop
        Write-Host "[OK] Project already exists!" -ForegroundColor Green
    }
    catch {
        Write-Host "Project does not exist. Creating it..." -ForegroundColor Yellow
        
        # Create project
        $createUrl = "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects"
        $createBody = @{
            name = $PROJECT_NAME
            production_branch = "main"
        } | ConvertTo-Json
        
        $project = Invoke-RestMethod -Uri $createUrl -Method Post -Headers $headers -Body $createBody -ErrorAction Stop
        Write-Host "[OK] Project created!" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Checking existing custom domains..." -ForegroundColor Yellow
    $domainsUrl = "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains"
    
    try {
        $existingDomains = Invoke-RestMethod -Uri $domainsUrl -Method Get -Headers $headers -ErrorAction Stop
        
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
    }
    catch {
        Write-Host "   No existing domains found." -ForegroundColor Gray
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
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "   1. Cloudflare will automatically create DNS records" -ForegroundColor Gray
        Write-Host "   2. SSL certificate will be provisioned automatically" -ForegroundColor Gray
        Write-Host "   3. Domain will be available at: https://$CUSTOM_DOMAIN" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Your SmartMetal CPQ will be live at:" -ForegroundColor Cyan
        Write-Host "   https://$CUSTOM_DOMAIN" -ForegroundColor Green
        Write-Host ""
        Write-Host "Note: After the first successful deployment, your site will be accessible." -ForegroundColor Yellow
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
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errorDetails) {
            Write-Host "   Details: $($errorDetails.errors | ConvertTo-Json -Depth 5)" -ForegroundColor Red
        }
        else {
            Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
    exit 1
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green

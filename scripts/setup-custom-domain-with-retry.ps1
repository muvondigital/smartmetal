# SmartMetal Cloudflare Pages Custom Domain Setup (with retry)
# Waits for deployment and adds smartmetal.muvondigital.my as custom domain

$ErrorActionPreference = "Stop"

Write-Host "Setting up Cloudflare Pages Custom Domain" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Cloudflare credentials
$CLOUDFLARE_API_TOKEN = "EjiG9ZjtEbmpp7FQPxsFQZAxt1EzoF-zGbFOyj2l"
$CLOUDFLARE_ACCOUNT_ID = "f42f0c63d485c9363d1d62042f9c3658"
$PROJECT_NAME = "smartmetal-cpq-web"
$CUSTOM_DOMAIN = "smartmetal.muvondigital.my"
$MAX_RETRIES = 12
$RETRY_DELAY = 30

# API headers
$headers = @{
    "Authorization" = "Bearer $CLOUDFLARE_API_TOKEN"
    "Content-Type" = "application/json"
}

# Function to check if project exists
function Test-ProjectExists {
    param($projectUrl, $headers)
    try {
        $project = Invoke-RestMethod -Uri $projectUrl -Method Get -Headers $headers -ErrorAction Stop
        return $project
    }
    catch {
        return $null
    }
}

# Wait for project to be created
$projectUrl = "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME"
Write-Host "Waiting for Pages project '$PROJECT_NAME' to be created..." -ForegroundColor Yellow
Write-Host "This may take a few minutes after deployment starts..." -ForegroundColor Gray
Write-Host ""

$project = $null
for ($i = 1; $i -le $MAX_RETRIES; $i++) {
    Write-Host "Attempt $i of ${MAX_RETRIES}: Checking for project..." -ForegroundColor Gray
    $project = Test-ProjectExists -projectUrl $projectUrl -headers $headers
    
    if ($project) {
        Write-Host "[OK] Project found!" -ForegroundColor Green
        Write-Host "   Project ID: $($project.result.id)" -ForegroundColor Gray
        break
    }
    
    if ($i -lt $MAX_RETRIES) {
        Write-Host "   Project not found yet. Waiting $RETRY_DELAY seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $RETRY_DELAY
    }
}

if (-not $project) {
    Write-Host "[ERROR] Project not found after $MAX_RETRIES attempts." -ForegroundColor Red
    Write-Host "   Please check GitHub Actions workflow status:" -ForegroundColor Yellow
    Write-Host "   https://github.com/muvondigital/smartmetal/actions" -ForegroundColor Cyan
    exit 1
}

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

try {
    $result = Invoke-RestMethod -Uri $domainsUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
    
    if ($result.success) {
        Write-Host "[OK] Custom domain added successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "   1. Cloudflare will automatically create DNS records" -ForegroundColor Gray
        Write-Host "   2. SSL certificate will be provisioned automatically" -ForegroundColor Gray
        Write-Host "   3. Domain will be available at: https://$CUSTOM_DOMAIN" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Note: DNS propagation may take a few minutes." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Your SmartMetal CPQ is now live at:" -ForegroundColor Cyan
        Write-Host "   https://$CUSTOM_DOMAIN" -ForegroundColor Green
    }
    else {
        Write-Host "[ERROR] Failed to add custom domain" -ForegroundColor Red
        Write-Host "   Error: $($result.errors | ConvertTo-Json)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "[ERROR] Error adding custom domain: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Details: $($errorDetails.errors | ConvertTo-Json -Depth 5)" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green

# Add custom domain using wrangler CLI

$ErrorActionPreference = "Stop"

Write-Host "Adding Custom Domain via Wrangler" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

$env:CLOUDFLARE_API_TOKEN = "EjiG9ZjtEbmpp7FQPxsFQZAxt1EzoF-zGbFOyj2l"
$env:CLOUDFLARE_ACCOUNT_ID = "f42f0c63d485c9363d1d62042f9c3658"
$PROJECT_NAME = "smartmetal-cpq-web"
$CUSTOM_DOMAIN = "smartmetal.muvondigital.my"

Write-Host "Checking if project exists..." -ForegroundColor Yellow
$projects = npx wrangler pages project list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to list projects" -ForegroundColor Red
    Write-Host $projects -ForegroundColor Red
    exit 1
}

if ($projects -match $PROJECT_NAME) {
    Write-Host "[OK] Project found!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Adding custom domain: $CUSTOM_DOMAIN" -ForegroundColor Yellow
    
    # Try to add domain - wrangler pages domain commands might need different syntax
    # Let's check what domains exist first
    Write-Host "Checking existing domains..." -ForegroundColor Yellow
    $domainList = npx wrangler pages domain list --project-name=$PROJECT_NAME 2>&1
    
    if ($domainList -match $CUSTOM_DOMAIN) {
        Write-Host "[OK] Domain already configured!" -ForegroundColor Green
        exit 0
    }
    
    # Add domain - note: wrangler might not have a direct "add" command
    # We may need to use the API or Cloudflare dashboard
    Write-Host "[INFO] Wrangler CLI may not support adding domains directly." -ForegroundColor Yellow
    Write-Host "Please add the domain via Cloudflare Dashboard:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://dash.cloudflare.com" -ForegroundColor Gray
    Write-Host "2. Workers & Pages > $PROJECT_NAME" -ForegroundColor Gray
    Write-Host "3. Custom domains > Add domain" -ForegroundColor Gray
    Write-Host "4. Enter: $CUSTOM_DOMAIN" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or run: scripts\add-custom-domain.ps1 after deployment succeeds" -ForegroundColor Yellow
}
else {
    Write-Host "[ERROR] Project '$PROJECT_NAME' not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Available projects:" -ForegroundColor Yellow
    Write-Host $projects -ForegroundColor Gray
    Write-Host ""
    Write-Host "The project will be created on first successful deployment." -ForegroundColor Yellow
    exit 1
}

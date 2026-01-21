# Manual project creation script - use if API doesn't work

Write-Host "Cloudflare Pages Project Creation Guide" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Since API creation failed, please create the project manually:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to: https://dash.cloudflare.com" -ForegroundColor Cyan
Write-Host "2. Navigate to: Workers & Pages" -ForegroundColor Gray
Write-Host "3. Click: 'Create application' > 'Pages' > 'Connect to Git'" -ForegroundColor Gray
Write-Host "4. Select: GitHub > muvondigital/smartmetal" -ForegroundColor Gray
Write-Host "5. Project name: smartmetal-cpq-web" -ForegroundColor Gray
Write-Host "6. Production branch: main" -ForegroundColor Gray
Write-Host "7. Build command: npm run build" -ForegroundColor Gray
Write-Host "8. Build output directory: dist" -ForegroundColor Gray
Write-Host "9. Root directory: /web" -ForegroundColor Gray
Write-Host ""
Write-Host "Environment variables to add:" -ForegroundColor Yellow
Write-Host "  - VITE_API_BASE_URL: https://smartmetal-backend-293567440480.us-central1.run.app" -ForegroundColor Gray
Write-Host "  - VITE_ENABLE_ONBOARDING_ENFORCEMENT: true" -ForegroundColor Gray
Write-Host ""
Write-Host "After project is created, run:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\add-custom-domain.ps1" -ForegroundColor Green
Write-Host ""

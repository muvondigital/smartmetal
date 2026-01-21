# Fix Radix UI Dependencies Installation Script
# Run this from PowerShell in the web/ directory

Write-Host "=== Fixing Radix UI Dependencies ===" -ForegroundColor Cyan
Write-Host ""

# Navigate to web directory
Set-Location $PSScriptRoot

Write-Host "Step 1: Cleaning npm cache..." -ForegroundColor Yellow
npm cache clean --force

Write-Host ""
Write-Host "Step 2: Removing node_modules and package-lock.json..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "  - Removed node_modules" -ForegroundColor Green
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
    Write-Host "  - Removed package-lock.json" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 3: Installing all dependencies..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "Step 4: Verifying Radix UI packages..." -ForegroundColor Yellow
$packages = @(
    "@radix-ui/react-accordion",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog"
)

foreach ($pkg in $packages) {
    if (Test-Path "node_modules/$pkg") {
        Write-Host "  ✓ $pkg installed" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $pkg MISSING" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Step 5: Testing dev server..." -ForegroundColor Yellow
Write-Host "Run 'npm run dev' to test if imports are resolved" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan

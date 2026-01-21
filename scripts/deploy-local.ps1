# SmartMetal Local Deployment Script (PowerShell)
# Builds and runs the application using Docker Compose

$ErrorActionPreference = "Stop"

Write-Host "🚀 SmartMetal Local Deployment" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    docker --version | Out-Null
} catch {
    Write-Host "❌ Error: Docker is not installed" -ForegroundColor Red
    Write-Host "Please install Docker from https://docs.docker.com/get-docker/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker Compose is installed
try {
    docker-compose --version | Out-Null
} catch {
    try {
        docker compose version | Out-Null
    } catch {
        Write-Host "❌ Error: Docker Compose is not installed" -ForegroundColor Red
        Write-Host "Please install Docker Compose from https://docs.docker.com/compose/install/" -ForegroundColor Yellow
        exit 1
    }
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Warning: .env file not found" -ForegroundColor Yellow
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file. Please edit it with your Azure credentials if needed." -ForegroundColor Green
}

Write-Host "📦 Building Docker images..." -ForegroundColor Cyan
docker-compose build

Write-Host ""
Write-Host "🗄️  Starting database and Redis..." -ForegroundColor Cyan
docker-compose up -d db redis

Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "🔄 Running database migrations..." -ForegroundColor Cyan
docker-compose run --rm backend node src/db/runAllMigrations.js

Write-Host ""
Write-Host "🌱 Seeding database (optional)..." -ForegroundColor Cyan
$seed = Read-Host "Do you want to seed demo data? (y/n)"
if ($seed -eq "y" -or $seed -eq "Y") {
    Write-Host "Seeding tenants and users..." -ForegroundColor Cyan
    docker-compose run --rm backend node scripts/seedTenantsAndUsers.js

    Write-Host "Seeding MetaSteel demo data..." -ForegroundColor Cyan
    docker-compose run --rm backend node scripts/seedMetaSteelDemoData.js
}

Write-Host ""
Write-Host "🚀 Starting all services..." -ForegroundColor Cyan
docker-compose up -d

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Services:" -ForegroundColor Cyan
Write-Host "   - Frontend:  http://localhost" -ForegroundColor White
Write-Host "   - Backend:   http://localhost:4000" -ForegroundColor White
Write-Host "   - API Docs:  http://localhost:4000/api/docs" -ForegroundColor White
Write-Host "   - Health:    http://localhost:4000/health" -ForegroundColor White
Write-Host ""
Write-Host "📊 View logs:" -ForegroundColor Cyan
Write-Host "   docker-compose logs -f" -ForegroundColor White
Write-Host ""
Write-Host "🛑 Stop services:" -ForegroundColor Cyan
Write-Host "   docker-compose down" -ForegroundColor White
Write-Host ""

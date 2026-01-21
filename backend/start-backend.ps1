# Backend Startup Script with Error Handling
Write-Host "=== Starting SmartMetal Backend ===" -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env file with DATABASE_URL and other required variables" -ForegroundColor Yellow
    exit 1
}

# Validate environment
Write-Host "Validating environment configuration..." -ForegroundColor Yellow
try {
    node -e "require('dotenv').config(); const { config } = require('./src/config/env'); console.log('✓ Config valid'); console.log('  Port:', config.server.port); console.log('  NodeEnv:', config.server.nodeEnv);"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Environment validation failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Failed to validate environment: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Starting backend server..." -ForegroundColor Green
Write-Host "Backend will be available at: http://localhost:4000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the server
node src/index.js

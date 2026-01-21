#!/bin/bash
# SmartMetal Production Deployment Script
# CAUTION: Only run this on production servers with proper environment configuration

set -e  # Exit on error

echo "🚀 SmartMetal Production Deployment"
echo "===================================="
echo ""

# Check environment
if [ "$NODE_ENV" != "production" ]; then
    echo "❌ Error: NODE_ENV must be set to 'production'"
    echo "Current NODE_ENV: $NODE_ENV"
    exit 1
fi

# Check required environment variables
REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET" "AZURE_OPENAI_ENDPOINT" "AZURE_OPENAI_KEY")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: Required environment variable $var is not set"
        exit 1
    fi
done

echo "✅ Environment checks passed"
echo ""

# Confirm production deployment
read -p "⚠️  WARNING: This will deploy to PRODUCTION. Continue? (yes/no) " -r
echo
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo "📦 Pulling latest code..."
git fetch origin
git checkout main
git pull origin main

echo ""
echo "📦 Installing dependencies..."
cd backend
npm ci --only=production
cd ../web
npm ci --only=production
cd ..

echo ""
echo "🏗️  Building frontend..."
cd web
npm run build
cd ..

echo ""
echo "🔄 Running database migrations..."
cd backend
npm run migrate
cd ..

echo ""
echo "🔄 Restarting backend service..."
# Assumes PM2 is used for process management
pm2 restart smartmetal-backend || pm2 start backend/src/index.js --name smartmetal-backend

echo ""
echo "📊 Checking service health..."
sleep 5
curl -f http://localhost:4000/health || {
    echo "❌ Health check failed!"
    exit 1
}

echo ""
echo "✅ Production deployment complete!"
echo ""
echo "📌 Services:"
echo "   - Backend:   http://localhost:4000"
echo "   - Health:    http://localhost:4000/health"
echo ""
echo "📊 View logs:"
echo "   pm2 logs smartmetal-backend"
echo ""

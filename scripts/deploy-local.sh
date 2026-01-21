#!/bin/bash
# SmartMetal Local Deployment Script
# Builds and runs the application using Docker Compose

set -e  # Exit on error

echo "🚀 SmartMetal Local Deployment"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose is not installed"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your Azure credentials if needed."
fi

echo "📦 Building Docker images..."
docker-compose build

echo ""
echo "🗄️  Starting database and Redis..."
docker-compose up -d db redis

echo "⏳ Waiting for database to be ready..."
sleep 10

echo ""
echo "🔄 Running database migrations..."
docker-compose run --rm backend node src/db/runAllMigrations.js

echo ""
echo "🌱 Seeding database (optional)..."
read -p "Do you want to seed demo data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Seeding tenants and users..."
    docker-compose run --rm backend node scripts/seedTenantsAndUsers.js

    echo "Seeding MetaSteel demo data..."
    docker-compose run --rm backend node scripts/seedMetaSteelDemoData.js
fi

echo ""
echo "🚀 Starting all services..."
docker-compose up -d

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📌 Services:"
echo "   - Frontend:  http://localhost"
echo "   - Backend:   http://localhost:4000"
echo "   - API Docs:  http://localhost:4000/api/docs"
echo "   - Health:    http://localhost:4000/health"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"
echo ""

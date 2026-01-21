# SmartMetal Backend - Cloud Run Deployment Script
# Run this script from the backend directory
#
# Prerequisites:
# 1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
# 2. Authenticate: gcloud auth login
# 3. Set project: gcloud config set project YOUR_PROJECT_ID

param(
    [string]$ProjectId = "",
    [string]$Region = "asia-southeast1",
    [string]$ServiceName = "smartmetal-backend"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SmartMetal Backend - Cloud Run Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: gcloud CLI not found. Please install Google Cloud SDK." -ForegroundColor Red
    Write-Host "Download from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Get project ID if not provided
if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Host "ERROR: No project ID set. Run: gcloud config set project YOUR_PROJECT_ID" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nProject: $ProjectId" -ForegroundColor Green
Write-Host "Region: $Region" -ForegroundColor Green
Write-Host "Service: $ServiceName" -ForegroundColor Green

# Step 1: Enable required APIs
Write-Host "`n[1/6] Enabling required GCP APIs..." -ForegroundColor Yellow
$apis = @(
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com"
)

foreach ($api in $apis) {
    Write-Host "  Enabling $api..."
    gcloud services enable $api --project=$ProjectId 2>$null
}

# Step 2: Create secrets in Secret Manager (if they don't exist)
Write-Host "`n[2/6] Setting up Secret Manager..." -ForegroundColor Yellow
Write-Host "  You need to create these secrets manually in GCP Console or CLI:" -ForegroundColor Cyan
Write-Host "  - DATABASE_URL (your Supabase connection string)"
Write-Host "  - JWT_SECRET (generate with: openssl rand -base64 32)"
Write-Host "  - GEMINI_API_KEY (from Google AI Studio)"
Write-Host "  - GCP_PROJECT_ID ($ProjectId)"
Write-Host "  - DOCUMENT_AI_PROCESSOR_ID (from Document AI console)"
Write-Host ""
Write-Host "  Example command to create a secret:" -ForegroundColor Gray
Write-Host '  echo -n "your-secret-value" | gcloud secrets create SECRET_NAME --data-file=-' -ForegroundColor Gray

# Step 3: Build the Docker image
Write-Host "`n[3/6] Building Docker image..." -ForegroundColor Yellow
$imageName = "gcr.io/$ProjectId/$ServiceName"
$imageTag = "$imageName`:latest"

docker build -t $imageTag -f Dockerfile .
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker build failed" -ForegroundColor Red
    exit 1
}

# Step 4: Push to Container Registry
Write-Host "`n[4/6] Pushing image to Container Registry..." -ForegroundColor Yellow
gcloud auth configure-docker --quiet
docker push $imageTag
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker push failed" -ForegroundColor Red
    exit 1
}

# Step 5: Deploy to Cloud Run
Write-Host "`n[5/6] Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $imageTag `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --memory 1Gi `
    --cpu 1 `
    --timeout 300 `
    --concurrency 80 `
    --min-instances 0 `
    --max-instances 10 `
    --set-env-vars "NODE_ENV=production" `
    --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GCP_PROJECT_ID=GCP_PROJECT_ID:latest,DOCUMENT_AI_PROCESSOR_ID=DOCUMENT_AI_PROCESSOR_ID:latest"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cloud Run deployment failed" -ForegroundColor Red
    Write-Host "Make sure you've created all required secrets in Secret Manager" -ForegroundColor Yellow
    exit 1
}

# Step 6: Get the service URL
Write-Host "`n[6/6] Getting service URL..." -ForegroundColor Yellow
$serviceUrl = gcloud run services describe $ServiceName --region $Region --format="value(status.url)"

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nService URL: $serviceUrl" -ForegroundColor Cyan
Write-Host "Health Check: $serviceUrl/health" -ForegroundColor Cyan
Write-Host "API Docs: $serviceUrl/api/docs" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Update your frontend VITE_API_URL to: $serviceUrl"
Write-Host "2. Test the health endpoint: curl $serviceUrl/health"
Write-Host "3. Set up Cloud Build trigger for automatic deployments"

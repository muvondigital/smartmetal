#!/bin/bash
# Configure Cloud Run environment variables for SmartMetal Backend
# Run this from Google Cloud Shell

PROJECT_ID="helpful-aurora-482800-v8"
SERVICE_NAME="smartmetal-backend"
REGION="us-central1"

echo "=== Configuring Cloud Run Environment Variables ==="

# Update the Cloud Run service with all required environment variables
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --update-env-vars="GCP_PROJECT_ID=$PROJECT_ID" \
  --update-env-vars="GCP_REGION=$REGION" \
  --update-env-vars="NODE_ENV=production" \
  --update-env-vars="VERTEX_AI_LOCATION=us-central1" \
  --update-env-vars="VERTEX_AI_MODEL=gemini-2.5-pro" \
  --update-env-vars="DOCUMENT_AI_LOCATION=us" \
  --update-env-vars="GCS_RFQ_BUCKET=helpful-aurora-482800-v8-rfq-documents" \
  --update-env-vars="GCS_EXTRACTED_BUCKET=helpful-aurora-482800-v8-extracted-data" \
  --update-env-vars="PUBSUB_EXTRACTION_TOPIC=document-extraction-topic" \
  --update-env-vars="PUBSUB_EXTRACTION_SUBSCRIPTION=document-extraction-sub" \
  --update-env-vars="PUBSUB_PARSING_TOPIC=ai-parsing-topic" \
  --update-env-vars="PUBSUB_PARSING_SUBSCRIPTION=ai-parsing-sub" \
  --update-env-vars="SUPABASE_URL=https://yotwggqpcbpvhenmahlf.supabase.co" \
  --update-env-vars="CORS_ORIGIN=https://smartmetal.muvondigital.my,http://localhost:3000,http://localhost:5173" \
  --update-env-vars="MAX_PDF_PAGES_TO_PROCESS=100" \
  --update-env-vars="ENABLE_DI_CHUNKED_FALLBACK=true" \
  --update-env-vars="DI_CHUNK_SIZE=10" \
  --update-env-vars="LOG_LEVEL=info" \
  --update-env-vars="GEMINI_FORCE_FALLBACK=false" \
  --update-env-vars="FRONTEND_URL=https://smartmetal.muvondigital.my"

echo ""
echo "=== Adding Secrets (if not already added) ==="
echo "Note: These secrets should already exist from your previous configuration"

# The following are already configured as secrets, but listing for reference:
# - DATABASE_URL
# - JWT_SECRET
# - GEMINI_API_KEY
# - DOCUMENT_AI_PROCESSOR_ID

# Add additional secrets that are missing
echo "Creating SUPABASE_ANON_KEY secret..."
echo -n "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdHdnZ3FwY2Jwdmhlbm1haGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTA4NDgsImV4cCI6MjA3OTQ2Njg0OH0.f-kmD8FnX1bh6tdh1ct1HGoZxFhE3_roXLWtqJF7HiY" | gcloud secrets create SUPABASE_ANON_KEY --data-file=- 2>/dev/null || echo "Secret already exists"

echo "Creating SUPABASE_SERVICE_ROLE_KEY secret..."
echo -n "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdHdnZ3FwY2Jwdmhlbm1haGxmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzg5MDg0OCwiZXhwIjoyMDc5NDY2ODQ4fQ.M98wt8I7Y-8weFWRlGnTGwa-IPjQPZu2QwmPqX5jZfk" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=- 2>/dev/null || echo "Secret already exists"

echo "Creating SESSION_SECRET secret..."
echo -n "gcp-migration-2025-smartmetal-pricer-session-secret-a8f3d92c" | gcloud secrets create SESSION_SECRET --data-file=- 2>/dev/null || echo "Secret already exists"

# Grant Cloud Run service account access to secrets
SERVICE_ACCOUNT="${PROJECT_ID}-compute@developer.gserviceaccount.com"
echo ""
echo "Granting secret access to service account: $SERVICE_ACCOUNT"

for SECRET in SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SESSION_SECRET; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" 2>/dev/null || echo "Permission already granted for $SECRET"
done

# Update Cloud Run to use the new secrets
echo ""
echo "Updating Cloud Run service with new secrets..."
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --update-secrets="SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest" \
  --update-secrets="SESSION_SECRET=SESSION_SECRET:latest"

echo ""
echo "=== Fixing Pub/Sub IAM Permissions ==="

# Get the Cloud Run service account
CLOUD_RUN_SA=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(spec.template.spec.serviceAccountName)")
if [ -z "$CLOUD_RUN_SA" ]; then
  # Default compute service account
  PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
  CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

echo "Cloud Run Service Account: $CLOUD_RUN_SA"

# Grant Pub/Sub subscriber role
echo "Granting Pub/Sub Subscriber role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_RUN_SA" \
  --role="roles/pubsub.subscriber"

# Grant Pub/Sub publisher role (for sending messages)
echo "Granting Pub/Sub Publisher role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_RUN_SA" \
  --role="roles/pubsub.publisher"

# Grant Pub/Sub viewer role (for listing topics/subscriptions)
echo "Granting Pub/Sub Viewer role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_RUN_SA" \
  --role="roles/pubsub.viewer"

echo ""
echo "=== Configuration Complete ==="
echo ""
echo "The Cloud Run service will automatically restart with the new configuration."
echo ""
echo "To verify, run:"
echo "  gcloud run services describe $SERVICE_NAME --region=$REGION --format='yaml(spec.template.spec.containers[0].env)'"
echo ""
echo "To check logs:"
echo "  gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=50"

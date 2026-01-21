/**
 * Google Cloud Storage Service
 * Replaces Azure Blob Storage with Google Cloud Storage
 * Maintains same interface for backward compatibility
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

const { Storage } = require('@google-cloud/storage');

let storage = null;
let rfqBucket = null;
let extractedBucket = null;

/**
 * Initialize Cloud Storage client
 */
function initializeBlobClient() {
  if (storage) {
    return storage;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const rfqBucketName = process.env.GCS_RFQ_BUCKET || 'pricer-rfq-documents';
  const extractedBucketName = process.env.GCS_EXTRACTED_BUCKET || 'pricer-extracted-data';

  if (!projectId) {
    console.warn('Google Cloud Storage project ID not configured');
    return null;
  }

  try {
    storage = new Storage({
      projectId: projectId,
    });
    rfqBucket = storage.bucket(rfqBucketName);
    extractedBucket = storage.bucket(extractedBucketName);

    console.log('✅ Google Cloud Storage client initialized');
    console.log(`   RFQ Bucket: ${rfqBucketName}`);
    console.log(`   Extracted Bucket: ${extractedBucketName}`);
    return storage;
  } catch (error) {
    console.error('Failed to initialize Google Cloud Storage client', error);
    return null;
  }
}

/**
 * Upload a file to Cloud Storage
 * MAINTAINS SAME INTERFACE as Azure Blob Storage version
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} containerName - Container name (e.g., 'rfq-documents')
 * @param {string} blobName - Blob name (filename)
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} File URL (gs:// format)
 */
async function uploadBlob(fileBuffer, containerName, blobName, contentType = 'application/octet-stream') {
  const client = initializeBlobClient();
  if (!client) {
    throw new Error('Google Cloud Storage client not initialized');
  }

  try {
    const bucket = containerName.includes('rfq') ? rfqBucket : extractedBucket;
    const file = bucket.file(blobName);

    await file.save(fileBuffer, {
      metadata: {
        contentType: contentType,
      },
    });

    const gsUrl = `gs://${bucket.name}/${blobName}`;
    console.log(`✅ File uploaded to Cloud Storage: ${gsUrl}`);

    return gsUrl;
  } catch (error) {
    console.error('Failed to upload to Cloud Storage', { error: error.message, containerName, blobName });
    throw error;
  }
}

/**
 * Download a file from Cloud Storage
 * @param {string} containerName - Container name
 * @param {string} blobName - Blob name
 * @returns {Promise<Buffer>} File content as buffer
 */
async function downloadBlob(containerName, blobName) {
  const client = initializeBlobClient();
  if (!client) {
    throw new Error('Google Cloud Storage client not initialized');
  }

  try {
    const bucket = containerName.includes('rfq') ? rfqBucket : extractedBucket;
    const file = bucket.file(blobName);

    const [contents] = await file.download();
    console.log(`✅ File downloaded from Cloud Storage: ${blobName} (${contents.length} bytes)`);

    return contents;
  } catch (error) {
    console.error('Failed to download from Cloud Storage', { error: error.message, containerName, blobName });
    throw error;
  }
}

/**
 * Delete a blob from Cloud Storage
 * @param {string} containerName - Container name
 * @param {string} blobName - Blob name
 * @returns {Promise<void>}
 */
async function deleteBlob(containerName, blobName) {
  const client = initializeBlobClient();
  if (!client) {
    throw new Error('Google Cloud Storage client not initialized');
  }

  try {
    const bucket = containerName.includes('rfq') ? rfqBucket : extractedBucket;
    const file = bucket.file(blobName);

    await file.delete();
    console.log(`✅ File deleted from Cloud Storage: ${blobName}`);
  } catch (error) {
    console.error('Failed to delete from Cloud Storage', { error: error.message, containerName, blobName });
    throw error;
  }
}

/**
 * Check if blob exists
 * @param {string} containerName - Container name
 * @param {string} blobName - Blob name
 * @returns {Promise<boolean>}
 */
async function blobExists(containerName, blobName) {
  const client = initializeBlobClient();
  if (!client) {
    return false;
  }

  try {
    const bucket = containerName.includes('rfq') ? rfqBucket : extractedBucket;
    const file = bucket.file(blobName);

    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    console.error('Failed to check blob existence', { error: error.message, containerName, blobName });
    return false;
  }
}

/**
 * Get signed URL for temporary access
 * @param {string} containerName - Container name
 * @param {string} blobName - Blob name
 * @param {number} expiresIn - Expiration in seconds (default: 3600)
 * @returns {Promise<string>} - Signed URL
 */
async function getSignedUrl(containerName, blobName, expiresIn = 3600) {
  const client = initializeBlobClient();
  if (!client) {
    throw new Error('Google Cloud Storage client not initialized');
  }

  try {
    const bucket = containerName.includes('rfq') ? rfqBucket : extractedBucket;
    const file = bucket.file(blobName);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });

    return url;
  } catch (error) {
    console.error('Failed to generate signed URL', { error: error.message, containerName, blobName });
    throw error;
  }
}

/**
 * Upload RFQ document
 * @param {Buffer} fileBuffer - File content
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<{blobUrl: string, blobName: string}>}
 */
async function uploadRfqDocument(fileBuffer, filename, contentType) {
  const containerName = process.env.GCS_RFQ_BUCKET || 'rfq-documents';
  const timestamp = Date.now();
  const blobName = `rfq-${timestamp}-${filename}`;

  const blobUrl = await uploadBlob(fileBuffer, containerName, blobName, contentType);

  return {
    blobUrl,
    blobName
  };
}

/**
 * Upload extracted data
 * @param {Buffer} dataBuffer - Data content
 * @param {string} filename - Filename
 * @returns {Promise<{blobUrl: string, blobName: string}>}
 */
async function uploadExtractedData(dataBuffer, filename) {
  const containerName = process.env.GCS_EXTRACTED_BUCKET || 'extracted-data';
  const timestamp = Date.now();
  const blobName = `extracted-${timestamp}-${filename}`;

  const blobUrl = await uploadBlob(dataBuffer, containerName, blobName, 'application/json');

  return {
    blobUrl,
    blobName
  };
}

/**
 * Document caching service for RFQ parsing
 * Caches extraction results to avoid re-processing duplicate documents
 */

const crypto = require('crypto');

/**
 * Generate hash for document buffer (used as cache key)
 * @param {Buffer} documentBuffer - Document content
 * @returns {string} SHA256 hash
 */
function generateDocumentHash(documentBuffer) {
  return crypto.createHash('sha256').update(documentBuffer).digest('hex');
}

/**
 * Get cached extraction result for a document
 * @param {Buffer} documentBuffer - Document content
 * @returns {Promise<Object|null>} Cached result or null if not found
 */
async function getCachedExtraction(documentBuffer) {
  const client = initializeBlobClient();
  if (!client) {
    return null;
  }

  try {
    const cacheBucketName = process.env.GCS_CACHE_BUCKET || process.env.GCS_EXTRACTED_BUCKET || 'pricer-extracted-data';
    const cacheBucket = client.bucket(cacheBucketName);
    
    const docHash = generateDocumentHash(documentBuffer);
    const cacheKey = `cache/rfq-extraction-${docHash}.json`;
    const file = cacheBucket.file(cacheKey);

    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }

    const [contents] = await file.download();
    const cachedResult = JSON.parse(contents.toString());
    
    console.log(`✅ Cache hit for document hash: ${docHash.substring(0, 16)}...`);
    return cachedResult;
  } catch (error) {
    // Cache miss or error - silently fail and continue with processing
    if (error.code !== 404) {
      console.warn('⚠️  Cache read error (continuing with processing):', error.message);
    }
    return null;
  }
}

/**
 * Store extraction result in cache
 * @param {Buffer} documentBuffer - Original document content
 * @param {Object} extractionResult - Extraction result to cache
 * @returns {Promise<void>}
 */
async function cacheExtraction(documentBuffer, extractionResult) {
  const client = initializeBlobClient();
  if (!client) {
    return; // Silently fail if storage not available
  }

  try {
    const cacheBucketName = process.env.GCS_CACHE_BUCKET || process.env.GCS_EXTRACTED_BUCKET || 'pricer-extracted-data';
    const cacheBucket = client.bucket(cacheBucketName);
    
    const docHash = generateDocumentHash(documentBuffer);
    const cacheKey = `cache/rfq-extraction-${docHash}.json`;
    const file = cacheBucket.file(cacheKey);

    // Add metadata to cached result
    const cachedData = {
      ...extractionResult,
      _cached: true,
      _cache_timestamp: new Date().toISOString(),
      _document_hash: docHash
    };

    await file.save(JSON.stringify(cachedData, null, 2), {
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    console.log(`💾 Cached extraction result: ${cacheKey}`);
  } catch (error) {
    // Silently fail - caching is optional
    console.warn('⚠️  Cache write error (non-critical):', error.message);
  }
}

module.exports = {
  initializeBlobClient,
  uploadBlob,
  downloadBlob,
  deleteBlob,
  blobExists,
  getSignedUrl,
  uploadRfqDocument,
  uploadExtractedData,
  generateDocumentHash,
  getCachedExtraction,
  cacheExtraction,
};

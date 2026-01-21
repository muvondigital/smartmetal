/**
 * Test Cloud Tasks configuration
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.gcp') });
const { config } = require('./src/config/env');

console.log('🔍 Cloud Tasks Configuration Check');
console.log('====================================\n');

console.log('GCP Project ID:', config.gcp.projectId || '❌ NOT SET');
console.log('GCP Location:', config.gcp.location || '❌ NOT SET');
console.log('Service Account Email:', config.gcp.serviceAccountEmail || '❌ NOT SET');
console.log('Cloud Tasks Queue:', config.gcp.cloudtasks.extractionQueue || '❌ NOT SET');
console.log('GOOGLE_APPLICATION_CREDENTIALS:', config.gcp.credentials || '❌ NOT SET');

console.log('\n✅ Configuration check complete');

// Test Cloud Tasks client initialization
try {
  const { CloudTasksClient } = require('@google-cloud/tasks');
  const tasksClient = new CloudTasksClient();
  console.log('\n✅ Cloud Tasks client initialized successfully');
  
  if (config.gcp.projectId && config.gcp.location && config.gcp.cloudtasks.extractionQueue) {
    const parent = tasksClient.queuePath(
      config.gcp.projectId,
      config.gcp.location,
      config.gcp.cloudtasks.extractionQueue
    );
    console.log('📋 Queue Path:', parent);
  }
} catch (error) {
  console.error('\n❌ Failed to initialize Cloud Tasks client:', error.message);
}


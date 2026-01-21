/**
 * Setup SLA Enforcement
 * 
 * This file can be used to set up periodic SLA enforcement
 * Options:
 * 1. Use node-cron (if installed)
 * 2. Use external cron/scheduled task
 * 3. Call enforceSLA() from API endpoint
 */

const { enforceSLA } = require('../services/approvalService');

// Option 1: Using node-cron (if installed)
// Uncomment and install: npm install node-cron
/*
const cron = require('node-cron');

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running scheduled SLA enforcement...');
  try {
    await enforceSLA();
  } catch (error) {
    console.error('❌ SLA enforcement failed:', error);
  }
});

console.log('✅ SLA enforcement scheduled (runs hourly)');
*/

// Option 2: Manual execution
// Run this file directly: node backend/src/jobs/setupSLAEnforcement.js
if (require.main === module) {
  console.log('⏰ Running SLA enforcement manually...');
  enforceSLA()
    .then(() => {
      console.log('✅ SLA enforcement completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ SLA enforcement failed:', error);
      process.exit(1);
    });
}

module.exports = { enforceSLA };


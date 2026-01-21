/**
 * SLA Enforcement Job
 * 
 * Periodically checks and enforces SLA deadlines for pending approvals
 * Should be run via cron job (e.g., every hour)
 * 
 * This job processes all active tenants to ensure tenant isolation.
 * 
 * Usage:
 * - Manual: node backend/src/jobs/slaEnforcementJob.js
 * - Cron: 0 * * * * node backend/src/jobs/slaEnforcementJob.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { enforceSLA } = require('../services/approvalService');
const { connectDb } = require('../db/supabaseClient');
const { log } = require('../utils/logger');
const crypto = require('crypto');

/**
 * Get all active tenants
 * @returns {Promise<Array>} Array of tenant objects
 */
async function getActiveTenants() {
  const db = await connectDb();
  const result = await db.query(
    `SELECT id, name, code FROM tenants WHERE is_active = true ORDER BY code`
  );
  return result.rows;
}

async function runSLAEnforcement() {
  const correlationId = crypto.randomUUID();
  const logContext = {
    correlationId,
    jobName: 'slaEnforcementJob',
    operation: 'job_start',
  };
  
  log.logInfo('SLA enforcement job started', logContext);
  console.log('⏰ Starting SLA enforcement job...');
  console.log(`   Time: ${new Date().toISOString()}`);
  
  try {
    // Get all active tenants
    const tenants = await getActiveTenants();
    log.logInfo('Processing tenants for SLA enforcement', {
      ...logContext,
      tenantCount: tenants.length,
    });
    console.log(`📋 Processing ${tenants.length} active tenant(s)`);

    let totalSlaExpired = 0;
    let totalEscalated = 0;
    let totalBackupAssigned = 0;
    let totalErrors = 0;
    const resultsByTenant = {};

    // Process each tenant
    for (const tenant of tenants) {
      const tenantLogContext = {
        ...logContext,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        operation: 'tenant_processing_start',
      };
      log.logInfo('Processing tenant for SLA enforcement', tenantLogContext);
      console.log(`\n🏢 Processing tenant: ${tenant.code} (${tenant.name})`);
      
      try {
        const results = await enforceSLA(tenant.id, { correlationId });
        
        log.logInfo('Tenant SLA enforcement completed', {
          ...tenantLogContext,
          operation: 'tenant_processing_end',
          slaExpired: results.slaExpired.length,
          escalated: results.escalated.length,
          backupAssigned: results.backupAssigned.length,
          errors: results.errors.length,
        });
        
        totalSlaExpired += results.slaExpired.length;
        totalEscalated += results.escalated.length;
        totalBackupAssigned += results.backupAssigned.length;
        totalErrors += results.errors.length;

        resultsByTenant[tenant.code] = {
          sla_expired: results.slaExpired.length,
          escalated: results.escalated.length,
          backup_assigned: results.backupAssigned.length,
          errors: results.errors.length,
          details: results
        };
        
        if (results.slaExpired.length > 0) {
          console.log(`  ⏰ SLA Expired: ${results.slaExpired.length}`);
        }
        
        if (results.escalated.length > 0) {
          console.log(`  ⬆️  Escalated: ${results.escalated.length}`);
        }
        
        if (results.backupAssigned.length > 0) {
          console.log(`  🔄 Backup Assignments: ${results.backupAssigned.length}`);
        }
        
        if (results.errors.length > 0) {
          console.log(`  ⚠️  Errors: ${results.errors.length}`);
        }
      } catch (tenantError) {
        console.error(`  ❌ Error processing tenant ${tenant.code}:`, tenantError);
        resultsByTenant[tenant.code] = {
          error: tenantError.message
        };
        totalErrors++;
      }
    }
    
    log.logInfo('SLA enforcement job completed', {
      ...logContext,
      operation: 'job_end',
      tenantsProcessed: tenants.length,
      totalSlaExpired,
      totalEscalated,
      totalBackupAssigned,
      totalErrors,
    });
    console.log(`\n✅ SLA enforcement completed for ${tenants.length} tenant(s)`);
    console.log(`   Total SLA Expired: ${totalSlaExpired}`);
    console.log(`   Total Escalated: ${totalEscalated}`);
    console.log(`   Total Backup Assignments: ${totalBackupAssigned}`);
    console.log(`   Total Errors: ${totalErrors}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ SLA enforcement job failed:', error);
    log.logError('SLA enforcement job failed', error, {
      ...logContext,
      operation: 'job_error',
    });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runSLAEnforcement();
}

module.exports = { runSLAEnforcement };


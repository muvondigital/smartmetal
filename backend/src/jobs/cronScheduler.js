// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Cron Job Scheduler - Runs background jobs on schedule

const cron = require('node-cron');
const { log } = require('../utils/logger');

/**
 * Cron Job Scheduler
 *
 * Manages scheduled background jobs using node-cron
 *
 * Features:
 * - SLA enforcement (every 15 minutes)
 * - Agreement expiration monitor (daily at 9 AM)
 * - Learning insights sync (weekly on Monday at 1 AM)
 * - Database backup verification (daily at 2 AM)
 *
 * Usage:
 * const cronScheduler = require('./jobs/cronScheduler');
 * cronScheduler.start();
 */

class CronScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Starts all cron jobs
   */
  start() {
    if (this.isRunning) {
      log.warn('Cron scheduler is already running');
      return;
    }

    log.info('Starting cron scheduler...');

    // Job 1: SLA Enforcement - Every 15 minutes
    const slaEnforcementJob = cron.schedule('*/15 * * * *', async () => {
      log.info('Running SLA enforcement job...');
      try {
        const { enforceSLA } = require('../services/approvalService');
        const { getAllTenantIds } = require('../config/tenantConfig');

        // Run for all tenants
        const tenantIds = await getAllTenantIds();
        for (const tenantId of tenantIds) {
          try {
            const result = await enforceSLA(tenantId, { correlationId: `sla-cron-${Date.now()}` });
            log.info(`SLA enforcement completed for tenant ${tenantId}`, {
              slaExpired: result.slaExpired.length,
              escalated: result.escalated.length,
              backupAssigned: result.backupAssigned.length,
            });
          } catch (error) {
            log.error(`SLA enforcement failed for tenant ${tenantId}`, error);
          }
        }
      } catch (error) {
        log.error('SLA enforcement job failed', error);
      }
    }, {
      scheduled: false, // Don't start immediately
      timezone: 'Asia/Kuala_Lumpur', // Malaysia timezone
    });

    // Job 2: Agreement Expiration Monitor - Daily at 9:00 AM
    const agreementExpirationJob = cron.schedule('0 9 * * *', async () => {
      log.info('Running agreement expiration monitor job...');
      try {
        const { monitorExpiringAgreements } = require('./agreementExpirationMonitor');
        const { getAllTenantIds } = require('../config/tenantConfig');

        const tenantIds = await getAllTenantIds();
        for (const tenantId of tenantIds) {
          try {
            await monitorExpiringAgreements(tenantId);
            log.info(`Agreement expiration monitor completed for tenant ${tenantId}`);
          } catch (error) {
            log.error(`Agreement expiration monitor failed for tenant ${tenantId}`, error);
          }
        }
      } catch (error) {
        log.error('Agreement expiration monitor job failed', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Kuala_Lumpur',
    });

    // Job 3: Learning Insights Sync - Weekly on Monday at 1:00 AM
    const learningInsightsSyncJob = cron.schedule('0 1 * * 1', async () => {
      log.info('Running learning insights sync job...');
      try {
        const { syncLearningInsights } = require('../services/learningService');
        const { getAllTenantIds } = require('../config/tenantConfig');

        const tenantIds = await getAllTenantIds();
        for (const tenantId of tenantIds) {
          try {
            await syncLearningInsights(tenantId);
            log.info(`Learning insights sync completed for tenant ${tenantId}`);
          } catch (error) {
            log.error(`Learning insights sync failed for tenant ${tenantId}`, error);
          }
        }
      } catch (error) {
        log.error('Learning insights sync job failed', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Kuala_Lumpur',
    });

    // Job 4: Database Backup Verification - Daily at 2:00 AM
    const backupVerificationJob = cron.schedule('0 2 * * *', async () => {
      log.info('Running database backup verification job...');
      try {
        const fs = require('fs');
        const path = require('path');
        const backupDir = path.join(__dirname, '../../backups');

        if (!fs.existsSync(backupDir)) {
          log.warn('Backup directory does not exist');
          return;
        }

        // Check if backup was created in the last 25 hours
        const files = fs.readdirSync(backupDir)
          .filter(f => f.endsWith('.sql'))
          .map(f => ({
            name: f,
            time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
          }))
          .sort((a, b) => b.time - a.time);

        if (files.length === 0) {
          log.error('No backup files found');
          return;
        }

        const latestBackup = files[0];
        const ageHours = (Date.now() - latestBackup.time) / (1000 * 60 * 60);

        if (ageHours > 25) {
          log.error(`Latest backup is ${ageHours.toFixed(1)} hours old (${latestBackup.name})`);
        } else {
          log.info(`Backup verification passed. Latest backup: ${latestBackup.name} (${ageHours.toFixed(1)} hours old)`);
        }
      } catch (error) {
        log.error('Database backup verification job failed', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Kuala_Lumpur',
    });

    // Store jobs for later stopping
    this.jobs = [
      { name: 'slaEnforcement', job: slaEnforcementJob, schedule: 'Every 15 minutes' },
      { name: 'agreementExpiration', job: agreementExpirationJob, schedule: 'Daily at 9:00 AM' },
      { name: 'learningInsightsSync', job: learningInsightsSyncJob, schedule: 'Weekly on Monday at 1:00 AM' },
      { name: 'backupVerification', job: backupVerificationJob, schedule: 'Daily at 2:00 AM' },
    ];

    // Start all jobs
    this.jobs.forEach(({ name, job, schedule }) => {
      job.start();
      log.info(` Cron job started: ${name} - ${schedule}`);
    });

    this.isRunning = true;
    log.info(` Cron scheduler started successfully (${this.jobs.length} jobs)`);
  }

  /**
   * Stops all cron jobs
   */
  stop() {
    if (!this.isRunning) {
      log.warn('Cron scheduler is not running');
      return;
    }

    log.info('Stopping cron scheduler...');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      log.info(`Stopped cron job: ${name}`);
    });

    this.jobs = [];
    this.isRunning = false;
    log.info('Cron scheduler stopped');
  }

  /**
   * Gets status of all cron jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: this.jobs.map(({ name, schedule }) => ({
        name,
        schedule,
        isRunning: this.isRunning,
      })),
    };
  }

  /**
   * Runs a specific job immediately (for testing)
   */
  async runJobNow(jobName) {
    const job = this.jobs.find(j => j.name === jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    log.info(`Manually triggering job: ${jobName}`);
    // The actual job logic is in the cron.schedule callback
    // We'll need to refactor to make jobs callable
    throw new Error('Manual job triggering not implemented yet. Use cron schedule for now.');
  }
}

// Singleton instance
const cronScheduler = new CronScheduler();

module.exports = cronScheduler;

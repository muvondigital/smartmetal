/**
 * Automated Database Backup Script
 *
 * Features:
 * - Automated daily backups
 * - Backup verification (test restore to temp database)
 * - Retention policy (7 daily, 4 weekly, 12 monthly)
 * - Backup failure alerts
 * - Compression (using pg_dump custom format)
 * - Metadata tracking (timestamp, size, verification status)
 *
 * Usage:
 * - Manual: node scripts/automated-backup.js
 * - Scheduled: Set up in Windows Task Scheduler or cron
 *
 * Requirements:
 * - PostgreSQL client tools (pg_dump, pg_restore) must be in PATH
 * - BACKUP_DIR environment variable (default: ./backups)
 * - DATABASE_URL environment variable
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_DAILY_BACKUPS = 7;
const MAX_WEEKLY_BACKUPS = 4;
const MAX_MONTHLY_BACKUPS = 12;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Get current timestamp for backup filename
 */
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
}

/**
 * Get backup type based on current date
 * - Monthly: First day of month
 * - Weekly: Sunday
 * - Daily: All other days
 */
function getBackupType() {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay(); // 0 = Sunday

  if (dayOfMonth === 1) {
    return 'monthly';
  } else if (dayOfWeek === 0) {
    return 'weekly';
  } else {
    return 'daily';
  }
}

/**
 * Create database backup
 */
function createBackup() {
  const timestamp = getTimestamp();
  const backupType = getBackupType();
  const filename = `backup_${backupType}_${timestamp}.dump`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log(`[Backup] Starting ${backupType} backup...`);
  console.log(`[Backup] Timestamp: ${timestamp}`);
  console.log(`[Backup] File: ${filename}`);

  try {
    // Run pg_dump with custom format (compressed)
    // --format=custom: Compressed binary format
    // --no-owner: Don't include ownership commands
    // --clean: Include DROP commands before CREATE
    // --if-exists: Use IF EXISTS for DROP commands
    const command = `pg_dump --format=custom --no-owner --clean --if-exists --file="${filepath}" "${DATABASE_URL}"`;

    console.log('[Backup] Running pg_dump...');
    execSync(command, { stdio: 'inherit' });

    // Get file size
    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`[Backup] ✓ Backup created successfully`);
    console.log(`[Backup] Size: ${sizeMB} MB`);

    // Create metadata file
    const metadataFilepath = filepath + '.meta.json';
    const metadata = {
      filename,
      filepath,
      timestamp,
      backupType,
      sizeMB: parseFloat(sizeMB),
      sizeBytes: stats.size,
      databaseUrl: DATABASE_URL.replace(/:[^:]*@/, ':****@'), // Hide password
      verified: false,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(metadataFilepath, JSON.stringify(metadata, null, 2));
    console.log('[Backup] ✓ Metadata saved');

    return { filepath, metadata };

  } catch (error) {
    console.error('[Backup] ✗ Backup failed:', error.message);

    // Send alert (integrate with Sentry or email)
    try {
      const sentry = require('../src/config/sentry');
      sentry.captureMessage(`Database backup failed: ${error.message}`, 'error', {
        tags: { backupType },
        extra: { timestamp, filepath }
      });
    } catch (sentryError) {
      console.warn('[Backup] Could not send Sentry alert:', sentryError.message);
    }

    throw error;
  }
}

/**
 * Verify backup by attempting to restore to a temporary database
 * This ensures the backup is not corrupted
 */
function verifyBackup(filepath) {
  console.log('[Backup] Verifying backup integrity...');

  try {
    // Create temporary database name
    const tempDbName = `backup_verify_${Date.now()}`;
    const dbUrl = new URL(DATABASE_URL);
    const originalDb = dbUrl.pathname.substring(1);

    // Create temp database
    console.log(`[Backup] Creating temporary database: ${tempDbName}`);
    const createDbUrl = DATABASE_URL.replace(`/${originalDb}`, '/postgres');
    execSync(`psql "${createDbUrl}" -c "CREATE DATABASE ${tempDbName};"`, { stdio: 'pipe' });

    // Restore to temp database
    console.log('[Backup] Restoring to temporary database...');
    const tempDbUrl = DATABASE_URL.replace(`/${originalDb}`, `/${tempDbName}`);
    execSync(`pg_restore --clean --if-exists --no-owner --dbname="${tempDbUrl}" "${filepath}"`, { stdio: 'pipe' });

    // Drop temp database
    console.log('[Backup] Cleaning up temporary database...');
    execSync(`psql "${createDbUrl}" -c "DROP DATABASE ${tempDbName};"`, { stdio: 'pipe' });

    console.log('[Backup] ✓ Backup verification passed');

    // Update metadata
    const metadataFilepath = filepath + '.meta.json';
    if (fs.existsSync(metadataFilepath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataFilepath, 'utf8'));
      metadata.verified = true;
      metadata.verifiedAt = new Date().toISOString();
      fs.writeFileSync(metadataFilepath, JSON.stringify(metadata, null, 2));
    }

    return true;

  } catch (error) {
    console.error('[Backup] ✗ Backup verification failed:', error.message);

    // Send alert
    try {
      const sentry = require('../src/config/sentry');
      sentry.captureMessage(`Database backup verification failed: ${error.message}`, 'error', {
        tags: { filepath },
        extra: { error: error.stack }
      });
    } catch (sentryError) {
      console.warn('[Backup] Could not send Sentry alert:', sentryError.message);
    }

    return false;
  }
}

/**
 * Apply retention policy
 * Keep: 7 daily, 4 weekly, 12 monthly backups
 */
function applyRetentionPolicy() {
  console.log('[Backup] Applying retention policy...');

  try {
    // Get all backup files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.dump'))
      .map(f => {
        const filepath = path.join(BACKUP_DIR, f);
        const metadataFilepath = filepath + '.meta.json';

        let metadata = null;
        if (fs.existsSync(metadataFilepath)) {
          metadata = JSON.parse(fs.readFileSync(metadataFilepath, 'utf8'));
        }

        return {
          filename: f,
          filepath,
          metadata,
          stats: fs.statSync(filepath),
        };
      })
      .sort((a, b) => b.stats.mtime - a.stats.mtime); // Sort by newest first

    // Group by backup type
    const daily = files.filter(f => f.metadata?.backupType === 'daily');
    const weekly = files.filter(f => f.metadata?.backupType === 'weekly');
    const monthly = files.filter(f => f.metadata?.backupType === 'monthly');

    // Delete old backups
    const toDelete = [
      ...daily.slice(MAX_DAILY_BACKUPS),
      ...weekly.slice(MAX_WEEKLY_BACKUPS),
      ...monthly.slice(MAX_MONTHLY_BACKUPS)
    ];

    toDelete.forEach(backup => {
      console.log(`[Backup] Deleting old backup: ${backup.filename}`);
      fs.unlinkSync(backup.filepath);

      // Delete metadata file if exists
      const metadataFilepath = backup.filepath + '.meta.json';
      if (fs.existsSync(metadataFilepath)) {
        fs.unlinkSync(metadataFilepath);
      }
    });

    console.log(`[Backup] ✓ Retention policy applied (deleted ${toDelete.length} old backups)`);
    console.log(`[Backup] Current backups: ${daily.length} daily, ${weekly.length} weekly, ${monthly.length} monthly`);

  } catch (error) {
    console.error('[Backup] ✗ Retention policy failed:', error.message);
    // Don't throw - retention policy failure is not critical
  }
}

/**
 * Main backup process
 */
async function runBackup() {
  console.log('========================================');
  console.log('DATABASE BACKUP PROCESS');
  console.log('========================================');
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Step 1: Create backup
    const { filepath, metadata } = createBackup();
    console.log('');

    // Step 2: Verify backup
    const verified = verifyBackup(filepath);
    console.log('');

    // Step 3: Apply retention policy
    applyRetentionPolicy();
    console.log('');

    console.log('========================================');
    console.log('BACKUP PROCESS COMPLETED SUCCESSFULLY');
    console.log('========================================');
    console.log(`End time: ${new Date().toISOString()}`);
    console.log(`Backup file: ${filepath}`);
    console.log(`Backup size: ${metadata.sizeMB} MB`);
    console.log(`Backup type: ${metadata.backupType}`);
    console.log(`Verified: ${verified ? 'YES' : 'NO'}`);
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('BACKUP PROCESS FAILED');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('');

    process.exit(1);
  }
}

// Run backup
runBackup();

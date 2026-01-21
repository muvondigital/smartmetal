#!/bin/bash

# ========================================
# Automated Database Backup Scheduler (cron)
# ========================================
#
# This script sets up cron to run daily backups at 2:00 AM every day.
#
# Requirements:
# - Run with appropriate permissions
# - Node.js and npm installed
# - PostgreSQL client tools (pg_dump) in PATH
#
# Usage:
# 1. Make script executable: chmod +x scripts/setup-backup-cron.sh
# 2. Run: ./scripts/setup-backup-cron.sh
#
# To verify:
# - Run: crontab -l
# - Look for "Pricer Database Backup" entry
#
# To test manually:
# - Run: node scripts/automated-backup.js
# - Check logs in backend/backups/backup.log
#
# ========================================

# Get absolute paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
NODE_BIN=$(which node)
BACKUP_SCRIPT="$SCRIPT_DIR/automated-backup.js"
LOG_FILE="$BACKEND_DIR/backups/backup.log"

# Cron entry (daily at 2:00 AM)
CRON_ENTRY="0 2 * * * cd $BACKEND_DIR && $NODE_BIN $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

echo "========================================"
echo "SETTING UP AUTOMATED DATABASE BACKUPS"
echo "========================================"
echo ""
echo "Configuration:"
echo "  Schedule: Daily at 2:00 AM"
echo "  Script: $BACKUP_SCRIPT"
echo "  Log File: $LOG_FILE"
echo "  Node.js: $NODE_BIN"
echo ""

# Check if Node.js is installed
if [ ! -f "$NODE_BIN" ]; then
    echo "✗ Node.js not found in PATH"
    echo "Please install Node.js first"
    exit 1
fi

# Check if backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "✗ Backup script not found: $BACKUP_SCRIPT"
    exit 1
fi

# Create backups directory if it doesn't exist
mkdir -p "$BACKEND_DIR/backups"

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo "⚠ Cron entry already exists. Updating..."
    # Remove old entry
    crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab -
fi

# Add new cron entry
(crontab -l 2>/dev/null; echo "# Pricer Database Backup (SmartMetal)"; echo "$CRON_ENTRY") | crontab -

echo "✓ Cron job created successfully"
echo ""

# Verify cron entry
echo "Current crontab:"
echo "----------------------------------------"
crontab -l | grep -A 1 "Pricer Database Backup"
echo "----------------------------------------"
echo ""

echo "========================================"
echo "SETUP COMPLETED SUCCESSFULLY"
echo "========================================"
echo ""
echo "Next Steps:"
echo "1. Verify cron entry: crontab -l"
echo "2. Test backup manually: node $BACKUP_SCRIPT"
echo "3. Check log file: tail -f $LOG_FILE"
echo "4. Verify backup files: ls -lh $BACKEND_DIR/backups"
echo ""

# Test if Node.js can run the script
echo "Testing Node.js..."
if $NODE_BIN -e "console.log('Node.js is working')" 2>&1; then
    echo "✓ Node.js test passed"
else
    echo "✗ Node.js test failed"
fi
echo ""

echo "========================================"
echo ""

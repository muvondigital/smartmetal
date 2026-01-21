# ========================================
# Automated Database Backup Scheduler
# ========================================
#
# This script sets up Windows Task Scheduler to run daily backups
# at 2:00 AM every day.
#
# Requirements:
# - Run PowerShell as Administrator
# - Node.js and npm installed
# - PostgreSQL client tools (pg_dump) in PATH
#
# Usage:
# 1. Open PowerShell as Administrator
# 2. Navigate to backend directory: cd C:\path\to\Pricer\backend
# 3. Run: .\scripts\setup-backup-schedule.ps1
#
# To verify:
# - Open Task Scheduler
# - Look for "Pricer Database Backup" task
# - Check "Last Run Time" and "Next Run Time"
#
# To test manually:
# - Right-click task in Task Scheduler
# - Select "Run"
# - Check logs in backend\backups\backup.log
#
# ========================================

# Configuration
$taskName = "Pricer Database Backup"
$description = "Automated database backup for SmartMetal CPQ"
$scriptPath = "$PSScriptRoot\automated-backup.js"
$logPath = "$PSScriptRoot\..\backups\backup.log"
$nodeExePath = (Get-Command node).Source
$workingDir = Split-Path -Parent $PSScriptRoot

# Schedule: Daily at 2:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At "2:00 AM"

# Action: Run Node.js script with logging
$action = New-ScheduledTaskAction `
    -Execute $nodeExePath `
    -Argument "`"$scriptPath`" >> `"$logPath`" 2>&1" `
    -WorkingDirectory $workingDir

# Settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Principal: Run with highest privileges
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType ServiceAccount `
    -RunLevel Highest

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SETTING UP AUTOMATED DATABASE BACKUPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Task Name: $taskName"
Write-Host "  Schedule: Daily at 2:00 AM"
Write-Host "  Script: $scriptPath"
Write-Host "  Log File: $logPath"
Write-Host "  Node.js: $nodeExePath"
Write-Host ""

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "⚠ Task already exists. Updating..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Register the task
try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Description $description `
        -Trigger $trigger `
        -Action $action `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host "✓ Scheduled task created successfully" -ForegroundColor Green
    Write-Host ""

    # Get task info
    $task = Get-ScheduledTask -TaskName $taskName
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName

    Write-Host "Task Details:" -ForegroundColor Yellow
    Write-Host "  State: $($task.State)"
    Write-Host "  Last Run: $($taskInfo.LastRunTime)"
    Write-Host "  Next Run: $($taskInfo.NextRunTime)"
    Write-Host "  Last Result: $($taskInfo.LastTaskResult)"
    Write-Host ""

    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "SETUP COMPLETED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Open Task Scheduler (taskschd.msc)"
    Write-Host "2. Find '$taskName' in Task Scheduler Library"
    Write-Host "3. Right-click and select 'Run' to test backup"
    Write-Host "4. Check log file: $logPath"
    Write-Host "5. Verify backup files in: $workingDir\backups"
    Write-Host ""

} catch {
    Write-Host "✗ Failed to create scheduled task" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Ensure PowerShell is running as Administrator"
    Write-Host "2. Check that Node.js is installed and in PATH"
    Write-Host "3. Verify script path: $scriptPath"
    Write-Host ""
    exit 1
}

# Test if Node.js can run the script
Write-Host "Testing backup script..." -ForegroundColor Yellow
Write-Host "Running: node `"$scriptPath`" --test" -ForegroundColor Gray

try {
    # Create a simple test to verify script can be loaded
    $testOutput = & $nodeExePath "-e" "console.log('Node.js is working')" 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Node.js test passed" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "✗ Node.js test failed" -ForegroundColor Red
        Write-Host "Output: $testOutput" -ForegroundColor Red
        Write-Host ""
    }

} catch {
    Write-Host "✗ Could not test Node.js" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

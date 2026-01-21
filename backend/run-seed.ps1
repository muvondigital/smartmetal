$ErrorActionPreference = "Continue"
Set-Location "c:\Users\Administrator\Desktop\Pricer\backend"

Write-Output "Starting admin seed script..." | Out-File "seed-log.txt"
Write-Output "Current directory: $(Get-Location)" | Out-File "seed-log.txt" -Append
Write-Output "Running node scripts\seedAdminUser.js..." | Out-File "seed-log.txt" -Append

try {
    $output = node scripts\seedAdminUser.js 2>&1 | Out-String
    Write-Output "Script output:" | Out-File "seed-log.txt" -Append
    Write-Output $output | Out-File "seed-log.txt" -Append
    Write-Output "Exit code: $LASTEXITCODE" | Out-File "seed-log.txt" -Append
} catch {
    Write-Output "Error: $_" | Out-File "seed-log.txt" -Append
}

Write-Output "Completed" | Out-File "seed-log.txt" -Append

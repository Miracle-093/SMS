$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting Aethina demo environment..."
npm.cmd run db:start

Start-Process -FilePath npm.cmd -ArgumentList "run","api:dev" -WorkingDirectory $root -WindowStyle Hidden
Start-Process -FilePath npm.cmd -ArgumentList "run","dev","--workspace","apps/desktop" -WorkingDirectory $root -WindowStyle Hidden
Start-Process -FilePath npm.cmd -ArgumentList "run","portal:dev" -WorkingDirectory $root -WindowStyle Hidden

Start-Sleep -Seconds 4
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\Print-Aethina-LanUrls.ps1"

Write-Host ""
Write-Host "Demo accounts:"
Write-Host "Admin:   admin@aethina.test / AdminPass123"
Write-Host "Bursar:  bursar@aethina.test / BursarPass123"
Write-Host "Teacher: grace.otieno@aethina.test / TeacherPass123"
Write-Host "Portal:  adm-001 / StudentPass123"

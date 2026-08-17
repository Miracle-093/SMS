Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "Starting Aethina SMS local services..."
npm.cmd run db:start

Start-Process -FilePath npm.cmd -ArgumentList "run", "api:dev" -WorkingDirectory $Root -WindowStyle Hidden
Start-Process -FilePath npm.cmd -ArgumentList "run", "dev", "--workspace", "apps/desktop" -WorkingDirectory $Root -WindowStyle Hidden

Start-Sleep -Seconds 8
Start-Process "http://127.0.0.1:5173"

Write-Host "Aethina SMS is opening in your browser."
Write-Host "Login: admin@aethina.test / AdminPass123"

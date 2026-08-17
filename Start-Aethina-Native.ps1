Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "Starting Aethina SMS native desktop app..."
npm.cmd run db:start

Start-Process -FilePath npm.cmd -ArgumentList "run", "api:dev" -WorkingDirectory $Root -WindowStyle Hidden

Write-Host "Launching Tauri. Keep this window open while developing."
npm.cmd run desktop:dev

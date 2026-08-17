$ErrorActionPreference = "Stop"

$backupRoot = Join-Path $env:USERPROFILE "AethinaBackups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetDir = Join-Path $backupRoot $timestamp
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$candidateRoots = @(
  Join-Path $env:APPDATA "com.aethina.sms",
  Join-Path $env:LOCALAPPDATA "com.aethina.sms",
  Join-Path $env:APPDATA "Aethina SMS",
  Join-Path $env:LOCALAPPDATA "Aethina SMS"
)

$files = foreach ($root in $candidateRoots) {
  if (Test-Path $root) {
    Get-ChildItem -Path $root -Recurse -Include "aethina-offline.db","*.sqlite","*.db" -ErrorAction SilentlyContinue
  }
}

if (-not $files) {
  Write-Host "No local SQLite database file found yet. Open the Tauri app once, then try again."
  exit 0
}

foreach ($file in $files) {
  Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $targetDir $file.Name) -Force
}

Write-Host "SQLite backup created:"
Write-Host $targetDir

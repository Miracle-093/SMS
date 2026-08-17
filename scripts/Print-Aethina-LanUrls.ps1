$ErrorActionPreference = "Stop"

try {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.PrefixOrigin -ne "WellKnown"
    } |
    Sort-Object InterfaceMetric |
    Select-Object -ExpandProperty IPAddress
} catch {
  $addresses = ipconfig |
    Select-String -Pattern "IPv4 Address|IPv4.*Address" |
    ForEach-Object { ($_ -split ":", 2)[1].Trim() } |
    Where-Object { $_ -and $_ -notlike "127.*" -and $_ -notlike "169.254.*" }
}

if (-not $addresses) {
  Write-Host "No LAN IPv4 address found. Check Wi-Fi/Ethernet connection."
  exit 1
}

$preferred = $addresses | Where-Object { $_ -like "192.168.*" -or $_ -like "10.*" } | Select-Object -First 1
$ip = if ($preferred) { $preferred } else { $addresses[0] }
Write-Host ""
Write-Host "Aethina local demo URLs"
Write-Host "-----------------------"
Write-Host "Desktop browser shell: http://$ip`:5173"
Write-Host "Student/Parent Portal: http://$ip`:5174"
Write-Host "API:                   http://$ip`:4000"
Write-Host ""
Write-Host "For phone testing, set apps/portal/.env.local:"
Write-Host "VITE_API_URL=http://$ip`:4000"
Write-Host ""
Write-Host "Detected IPv4 candidates:"
$addresses | ForEach-Object { Write-Host "- $_" }
Write-Host ""
Write-Host "Phone and PC must be on the same private Wi-Fi/LAN."

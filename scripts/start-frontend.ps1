# RetailPulse — start React frontend (port 5173)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\frontend"
Write-Host "Starting RetailPulse Frontend on http://localhost:5173 ..."
npm run dev

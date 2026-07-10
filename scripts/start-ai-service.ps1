# RetailPulse — start AI/ML service (port 8000)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\ai-service"

if (-not (Test-Path ".\.venv\Scripts\uvicorn.exe")) {
    Write-Error "Virtual env missing. Run: py -3.11 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
}

Write-Host "Starting RetailPulse AI Service on http://localhost:8000 ..."
.\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000 --reload

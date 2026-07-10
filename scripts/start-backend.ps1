# RetailPulse — start Spring Boot backend (port 8080)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\backend"

$envFile = Join-Path (Get-Location) ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment from .env ..."
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim().Trim('"')
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
} else {
    Write-Host "No .env found — copy .env.example to .env or set env vars manually."
}

Write-Host "Starting RetailPulse Backend on http://localhost:8080 ..."
mvn spring-boot:run

# Quick health check for all RetailPulse services
Write-Host "RetailPulse Service Status" -ForegroundColor Cyan
Write-Host "========================="

function Test-Url($name, $url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        Write-Host "[OK]   $name -> $($r.StatusCode) $url" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[DOWN] $name -> $url" -ForegroundColor Red
        return $false
    }
}

$ai = Test-Url "AI Service   " "http://localhost:8000/health"
$be = Test-Url "Backend      " "http://localhost:8080/api/auth/login"  # 405/400/500 still means port open
$fe = Test-Url "Frontend     " "http://localhost:5173/"

Write-Host ""
if ($ai -and $fe) {
    Write-Host "Open app: http://localhost:5173" -ForegroundColor Yellow
}
if (-not $ai) {
    Write-Host "Start AI:  .\scripts\start-ai-service.ps1" -ForegroundColor Yellow
}
if (-not $be) {
    Write-Host "Start API: .\scripts\start-backend.ps1" -ForegroundColor Yellow
}
if (-not $fe) {
    Write-Host "Start UI:  .\scripts\start-frontend.ps1" -ForegroundColor Yellow
}

$ErrorActionPreference = "Stop"
$base = "http://localhost:8000"

function Test-Endpoint($name, $method, $url, $body) {
    Write-Host "`n=== $name ===" -ForegroundColor Cyan
    try {
        if ($method -eq "GET") {
            $r = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 15
        } else {
            $r = Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 30
        }
        Write-Host "PASS" -ForegroundColor Green
        $r | ConvertTo-Json -Depth 5 -Compress | ForEach-Object { if ($_.Length -gt 500) { $_.Substring(0, 500) + "..." } else { $_ } }
        return $true
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

$results = @{}
$results["health"] = Test-Endpoint "Health" "GET" "$base/health" $null

$results["forecast"] = Test-Endpoint "Forecast" "POST" "$base/ml/forecast" @{
    product_ids = @(1)
    store_id = 1
    horizon = "weekly"
    historical_data = @(
        @{ date = "2026-01-01"; quantity = 45 }
        @{ date = "2026-01-02"; quantity = 52 }
        @{ date = "2026-01-03"; quantity = 48 }
        @{ date = "2026-01-04"; quantity = 55 }
        @{ date = "2026-01-05"; quantity = 50 }
        @{ date = "2026-01-06"; quantity = 47 }
        @{ date = "2026-01-07"; quantity = 53 }
        @{ date = "2026-01-08"; quantity = 49 }
    )
}

$results["churn"] = Test-Endpoint "Churn" "POST" "$base/ml/churn" @{
    customers = @(@{
        customer_id = 1
        recency_days = 45
        frequency = 12
        monetary_total = 245000
        avg_transaction = 20416
        customer_type = "contractor"
        loyalty_member = $true
    })
}

$results["stockout"] = Test-Endpoint "Stockout" "POST" "$base/ml/stockout" @{
    products = @(@{
        product_id = 1
        current_stock = 8
        daily_demand_avg = 12
        lead_time_days = 3
        reorder_point = 30
    })
}

$results["recommend"] = Test-Endpoint "Recommend" "POST" "$base/ml/recommend" @{
    transactions = @(
        @{ transaction_id = 1; products = @(1, 5, 12) }
        @{ transaction_id = 2; products = @(1, 8) }
    )
    product_id = 1
    type = "cross_sell"
    limit = 10
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Yellow
$results.GetEnumerator() | ForEach-Object {
    $color = if ($_.Value) { "Green" } else { "Red" }
    Write-Host "$($_.Key): $(if ($_.Value) { 'PASS' } else { 'FAIL' })" -ForegroundColor $color
}

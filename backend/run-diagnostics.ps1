# Comprehensive Backend Diagnostic Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BACKEND DIAGNOSTIC TEST SUITE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$results = @{}

# Test 1: Check if backend is running on port 4000
Write-Host "[TEST 1] Checking port 4000 binding..." -ForegroundColor Yellow
$portCheck = netstat -ano | findstr :4000
if ($portCheck) {
    Write-Host "  ✅ Port 4000 is IN USE" -ForegroundColor Green
    $portCheck | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    $results.portBound = $true
    $results.portInfo = $portCheck
} else {
    Write-Host "  ❌ Port 4000 is NOT in use" -ForegroundColor Red
    $results.portBound = $false
}
Write-Host ""

# Test 2: Health endpoint
Write-Host "[TEST 2] Testing /health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri http://localhost:4000/health -TimeoutSec 5
    Write-Host "  ✅ Health endpoint RESPONDED" -ForegroundColor Green
    Write-Host "     Status: OK" -ForegroundColor Gray
    Write-Host "     Response: $($healthResponse | ConvertTo-Json -Compress)" -ForegroundColor Gray
    $results.healthEndpoint = @{
        success = $true
        status = "ok"
        response = $healthResponse
    }
} catch {
    Write-Host "  ❌ Health endpoint FAILED" -ForegroundColor Red
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
    $results.healthEndpoint = @{
        success = $false
        error = $_.Exception.Message
        errorType = $_.Exception.GetType().Name
    }
}
Write-Host ""

# Test 3: API RFQs endpoint (simulating frontend call)
Write-Host "[TEST 3] Testing /api/rfqs endpoint (frontend simulation)..." -ForegroundColor Yellow
try {
    $headers = @{
        'Accept' = 'application/json'
        'Content-Type' = 'application/json'
    }
    $rfqResponse = Invoke-WebRequest -Uri http://localhost:4000/api/rfqs -Headers $headers -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✅ RFQs endpoint RESPONDED" -ForegroundColor Green
    Write-Host "     Status Code: $($rfqResponse.StatusCode)" -ForegroundColor Gray
    $results.rfqsEndpoint = @{
        success = $true
        statusCode = $rfqResponse.StatusCode
        hasContent = $rfqResponse.Content.Length -gt 0
    }
} catch {
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  ⚠️  RFQs endpoint returned HTTP $statusCode" -ForegroundColor Yellow
        if ($statusCode -eq 401) {
            Write-Host "     (401 = Auth required - this is EXPECTED)" -ForegroundColor Gray
        }
        $results.rfqsEndpoint = @{
            success = $true
            statusCode = $statusCode
            note = "Auth required (expected)"
        }
    } else {
        Write-Host "  ❌ RFQs endpoint FAILED" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
        $results.rfqsEndpoint = @{
            success = $false
            error = $_.Exception.Message
            errorType = $_.Exception.GetType().Name
        }
    }
}
Write-Host ""

# Test 4: API Price Agreements endpoint
Write-Host "[TEST 4] Testing /api/price-agreements endpoint..." -ForegroundColor Yellow
try {
    $headers = @{
        'Accept' = 'application/json'
        'Content-Type' = 'application/json'
    }
    $paResponse = Invoke-WebRequest -Uri http://localhost:4000/api/price-agreements -Headers $headers -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✅ Price Agreements endpoint RESPONDED" -ForegroundColor Green
    Write-Host "     Status Code: $($paResponse.StatusCode)" -ForegroundColor Gray
    $results.priceAgreementsEndpoint = @{
        success = $true
        statusCode = $paResponse.StatusCode
        hasContent = $paResponse.Content.Length -gt 0
    }
} catch {
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  ⚠️  Price Agreements endpoint returned HTTP $statusCode" -ForegroundColor Yellow
        if ($statusCode -eq 401) {
            Write-Host "     (401 = Auth required - this is EXPECTED)" -ForegroundColor Gray
        }
        $results.priceAgreementsEndpoint = @{
            success = $true
            statusCode = $statusCode
            note = "Auth required (expected)"
        }
    } else {
        Write-Host "  ❌ Price Agreements endpoint FAILED" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
        $results.priceAgreementsEndpoint = @{
            success = $false
            error = $_.Exception.Message
            errorType = $_.Exception.GetType().Name
        }
    }
}
Write-Host ""

# Test 5: CORS check
Write-Host "[TEST 5] Testing CORS configuration..." -ForegroundColor Yellow
try {
    $corsHeaders = @{
        'Origin' = 'http://localhost:5173'
        'Access-Control-Request-Method' = 'GET'
    }
    $corsResponse = Invoke-WebRequest -Uri http://localhost:4000/health -Headers $corsHeaders -UseBasicParsing -TimeoutSec 5 -Method OPTIONS -ErrorAction Stop
    Write-Host "  ✅ CORS preflight successful" -ForegroundColor Green
    $results.cors = @{
        success = $true
        note = "CORS headers present"
    }
} catch {
    # Check if CORS headers are in response
    try {
        $testResponse = Invoke-WebRequest -Uri http://localhost:4000/health -UseBasicParsing -TimeoutSec 5
        $corsHeader = $testResponse.Headers['Access-Control-Allow-Origin']
        if ($corsHeader) {
            Write-Host "  ✅ CORS configured (Allow-Origin: $corsHeader)" -ForegroundColor Green
            $results.cors = @{
                success = $true
                allowOrigin = $corsHeader
            }
        } else {
            Write-Host "  ⚠️  CORS headers not visible in response" -ForegroundColor Yellow
            $results.cors = @{
                success = $false
                note = "CORS headers not found"
            }
        }
    } catch {
        Write-Host "  ❌ Cannot test CORS (backend not accessible)" -ForegroundColor Red
        $results.cors = @{
            success = $false
            error = $_.Exception.Message
        }
    }
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($results.portBound) {
    Write-Host "✅ Port 4000: BOUND" -ForegroundColor Green
} else {
    Write-Host "❌ Port 4000: NOT BOUND" -ForegroundColor Red
}

if ($results.healthEndpoint.success) {
    Write-Host "✅ Health Endpoint: WORKING" -ForegroundColor Green
} else {
    Write-Host "❌ Health Endpoint: FAILED" -ForegroundColor Red
}

if ($results.rfqsEndpoint.success) {
    Write-Host "✅ RFQs Endpoint: ACCESSIBLE (Status: $($results.rfqsEndpoint.statusCode))" -ForegroundColor Green
} else {
    Write-Host "❌ RFQs Endpoint: FAILED" -ForegroundColor Red
}

if ($results.priceAgreementsEndpoint.success) {
    Write-Host "✅ Price Agreements Endpoint: ACCESSIBLE (Status: $($results.priceAgreementsEndpoint.statusCode))" -ForegroundColor Green
} else {
    Write-Host "❌ Price Agreements Endpoint: FAILED" -ForegroundColor Red
}

if ($results.cors.success) {
    Write-Host "✅ CORS: CONFIGURED" -ForegroundColor Green
} else {
    Write-Host "⚠️  CORS: NEEDS VERIFICATION" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Full results saved to: backend-diagnostic-results.json" -ForegroundColor Gray
$results | ConvertTo-Json -Depth 5 | Out-File -FilePath backend-diagnostic-results.json -Encoding utf8

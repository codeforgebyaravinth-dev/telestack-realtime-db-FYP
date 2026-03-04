# Telestack Worker Latency Benchmark Script
# Measures response times for all CRUD operations

# Configurable base URL (Set to production URL for true Indian latency)
$baseUrl = $args[0]
if (-not $baseUrl) { $baseUrl = "http://localhost:8787" }

Write-Host "Targeting: $baseUrl" -ForegroundColor Cyan

$workspaceId = "default"
$testUserId = "benchmark-user"

# Helper function to measure latency
function Measure-Operation {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )
    
    $times = @()
    $iterations = 5
    
    for ($i = 0; $i -lt $iterations; $i++) {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            if ($Body) {
                $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -Body $Body -ContentType "application/json" -ErrorAction Stop -UseBasicParsing
            } else {
                $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -ErrorAction Stop -UseBasicParsing
            }
            $stopwatch.Stop()
            $times += $stopwatch.ElapsedMilliseconds
            
            $internalLatency = $null
            if ($response.Headers["X-Internal-Latency"]) {
                $internalLatency = $response.Headers["X-Internal-Latency"]
            }
            
            Start-Sleep -Milliseconds 100
        } catch {
            $stopwatch.Stop()
            Write-Host "Error in $Name : $_" -ForegroundColor Red
            return $null
        }
    }
    
    $avg = ($times | Measure-Object -Average).Average
    $min = ($times | Measure-Object -Minimum).Minimum
    $max = ($times | Measure-Object -Maximum).Maximum
    
    return @{
        Name = $Name
        Average = [math]::Round($avg, 2)
        Min = $min
        Max = $max
        Internal = $internalLatency
        Samples = $times
    }
}

Write-Host "`n=== TELESTACK LATENCY BENCHMARK ===" -ForegroundColor Cyan
Write-Host "Running 5 iterations per operation...`n" -ForegroundColor Yellow

$results = @()

# 1. CREATE Document
Write-Host "Testing CREATE..." -ForegroundColor Green
$createBody = @{
    data = @{ message = "Benchmark test"; timestamp = (Get-Date).ToString() }
    userId = $testUserId
    workspaceId = $workspaceId
} | ConvertTo-Json

$result = Measure-Operation -Name "CREATE" -Method "POST" -Url "$baseUrl/documents/benchmarks" -Headers @{ workspaceId = $workspaceId } -Body $createBody
if ($result) { $results += $result }

# 2. READ Single Document
Write-Host "Testing READ (Single)..." -ForegroundColor Green
$result = Measure-Operation -Name "READ_SINGLE" -Method "GET" -Url "$baseUrl/documents/benchmarks/test-doc-1" -Headers @{ workspaceId = $workspaceId }
if ($result) { $results += $result }

# 3. LIST Collection
Write-Host "Testing LIST (Collection)..." -ForegroundColor Green
$result = Measure-Operation -Name "LIST_COLLECTION" -Method "GET" -Url "$baseUrl/documents/benchmarks" -Headers @{ workspaceId = $workspaceId }
if ($result) { $results += $result }

# 4. QUERY with Filters
Write-Host "Testing QUERY..." -ForegroundColor Green
$queryUrl = "$baseUrl/documents/query?path=benchmarks&filters=" + [System.Web.HttpUtility]::UrlEncode('[]')
$result = Measure-Operation -Name "QUERY" -Method "GET" -Url $queryUrl -Headers @{ workspaceId = $workspaceId }
if ($result) { $results += $result }

# 5. UPDATE Document
Write-Host "Testing UPDATE..." -ForegroundColor Green
$updateBody = @{
    data = @{ message = "Updated benchmark"; timestamp = (Get-Date).ToString() }
    userId = $testUserId
    workspaceId = $workspaceId
} | ConvertTo-Json

$result = Measure-Operation -Name "UPDATE" -Method "PUT" -Url "$baseUrl/documents/benchmarks/test-doc-1" -Headers @{ workspaceId = $workspaceId } -Body $updateBody
if ($result) { $results += $result }

# 6. DELETE Document
Write-Host "Testing DELETE..." -ForegroundColor Green
$result = Measure-Operation -Name "DELETE" -Method "DELETE" -Url "$baseUrl/documents/benchmarks/test-doc-1" -Headers @{ workspaceId = $workspaceId }
if ($result) { $results += $result }

# 7. Discovery: Collections
Write-Host "Testing DISCOVERY (Collections)..." -ForegroundColor Green
$result = Measure-Operation -Name "DISCOVERY_COLLECTIONS" -Method "GET" -Url "$baseUrl/documents/internal/collections" -Headers @{ workspaceId = $workspaceId }
if ($result) { $results += $result }

# 8. BATCH Operations
Write-Host "Testing BATCH..." -ForegroundColor Green
$batchBody = @{
    operations = @(
        @{ type = "SET"; path = "benchmarks/batch1"; data = @{ test = 1 } }
        @{ type = "SET"; path = "benchmarks/batch2"; data = @{ test = 2 } }
    )
} | ConvertTo-Json -Depth 5

$result = Measure-Operation -Name "BATCH" -Method "POST" -Url "$baseUrl/documents/batch" -Headers @{ workspaceId = $workspaceId } -Body $batchBody
if ($result) { $results += $result }

# Display Results
Write-Host "`n=== BENCHMARK RESULTS ===" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Gray
Write-Host ("{0,-25} {1,10} {2,10} {3,10} {4,10}" -f "Operation", "Avg (ms)", "Min (ms)", "Max (ms)", "Edge (ms)") -ForegroundColor Yellow
Write-Host ("=" * 80) -ForegroundColor Gray

foreach ($r in $results) {
    $color = if ($r.Average -lt 500) { "Green" } elseif ($r.Average -lt 1000) { "Yellow" } else { "Red" }
    Write-Host ("{0,-25} {1,10} {2,10} {3,10} {4,10}" -f $r.Name, $r.Average, $r.Min, $r.Max, $r.Internal) -ForegroundColor $color
}

Write-Host ("=" * 70) -ForegroundColor Gray

# Calculate overall average
$overallAvg = ($results | ForEach-Object { $_.Average } | Measure-Object -Average).Average
Write-Host "`nOverall Average: $([math]::Round($overallAvg, 2))ms" -ForegroundColor Cyan

# Export to JSON
$results | ConvertTo-Json -Depth 5 | Out-File "benchmark_results.json"
Write-Host "`nResults saved to benchmark_results.json" -ForegroundColor Green

// Native fetch is available in Node.js v18+

const ENDPOINT = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const API_KEY = 'tsk_live_abc123';
const COLLECTION = 'benchmarks';

async function runBenchmark(iterations = 100, concurrency = 10) {
    console.log(`🚀 Starting Telestack Optimized Benchmark (${iterations} iterations, concurrency=${concurrency})...`);
    console.log(`📍 Endpoint: ${ENDPOINT}`);

    // 1. Warming Phase (Crucial for Cloudflare Edge & Connection Pooling)
    console.log('🔥 Warming up edge nodes and TCP connections...');
    for (let i = 0; i < 10; i++) {
        await fetch(`${ENDPOINT}/documents/internal/collections`, {
            headers: { 'X-API-Key': API_KEY }
        });
        if (i % 2 === 0) process.stdout.write('♨️');
    }
    console.log('\n✅ Warm-up complete.\n');

    const e2eLatencies = [];
    const internalLatencies = [];
    let successCount = 0;

    const runTask = async (i) => {
        const start = Date.now();
        try {
            // Node.js native fetch handles connection pooling/keep-alive automatically
            const res = await fetch(`${ENDPOINT}/documents/${COLLECTION}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY
                },
                body: JSON.stringify({
                    data: { test: 'latency_opt', iteration: i, timestamp: Date.now() },
                    userId: 'benchmarker'
                })
            });

            if (res.ok) {
                const e2e = Date.now() - start;
                const internal = parseInt(res.headers.get('x-internal-latency') || '0');
                e2eLatencies.push(e2e);
                if (internal > 0) internalLatencies.push(internal);
                successCount++;
                if (i % 10 === 0) process.stdout.write('.');
            }
        } catch (err) {
            console.error(`\n❌ Error:`, err.message);
        }
    };

    const startTime = Date.now();
    for (let i = 0; i < iterations; i += concurrency) {
        const batch = [];
        for (let j = 0; j < concurrency && (i + j) < iterations; j++) {
            batch.push(runTask(i + j));
        }
        await Promise.withResolvers ? await Promise.all(batch) : await Promise.all(batch);
    }
    const totalDuration = Date.now() - startTime;

    console.log('\n\n📊 Optimized Results:');

    function stats(arr, label) {
        if (arr.length === 0) return;
        arr.sort((a, b) => a - b);
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const p50 = arr[Math.floor(arr.length * 0.5)];
        const p95 = arr[Math.floor(arr.length * 0.95)];
        const p99 = arr[Math.floor(arr.length * 0.99)];
        console.log(`--- ${label} ---`);
        console.log(`Avg: ${avg.toFixed(2)}ms | P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);
    }

    stats(e2eLatencies, 'End-to-End Latency (Warm)');
    stats(internalLatencies, 'Internal Latency (Edge -> D1)');

    const throughput = (successCount / (totalDuration / 1000)).toFixed(2);
    console.log(`\n🚀 Parallel Throughput: ${throughput} ops/sec`);
}

runBenchmark(100, 10).catch(console.error);

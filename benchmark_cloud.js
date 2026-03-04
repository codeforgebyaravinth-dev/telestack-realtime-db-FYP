/**
 * TELESTACK CLOUD PERFORMANCE BENCHMARK (Node.js)
 * Better representative of production SDK usage (Keep-Alive, Connection Pooling)
 */

const BASE_URL = process.argv[2] || 'https://telestack-realtime-db.codeforgebyaravinth.workers.dev';
const WORKSPACE_ID = 'bench-js-123';
const TEST_DOC_ID = 'test-doc-js';

const HEADERS = {
    'workspaceId': WORKSPACE_ID,
    'Content-Type': 'application/json'
};

async function measure(name, method, path, body = null) {
    const start = Date.now();
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: HEADERS,
            body: body ? JSON.stringify(body) : null
        });

        const end = Date.now();
        const internal = response.headers.get('X-Internal-Latency') || 'N/A';
        const status = response.status;

        return {
            name,
            total: end - start,
            internal,
            status
        };
    } catch (err) {
        return { name, error: err.message };
    }
}

async function runBenchmark() {
    console.log(`\n🚀 Starting JavaScript Cloud Benchmark`);
    console.log(`📍 Targeting: ${BASE_URL}\n`);

    const results = [];
    const ops = 5; // Iterations per op

    const tests = [
        { name: 'CREATE (POST)', method: 'POST', path: `/documents/benchmarks`, body: { data: { msg: "JS Bench" }, userId: "js-user" } },
        { name: 'READ (GET)', method: 'GET', path: `/documents/benchmarks/${TEST_DOC_ID}` },
        { name: 'LIST (GET)', method: 'GET', path: `/documents/benchmarks` },
        { name: 'QUERY (GET)', method: 'GET', path: `/documents/query?path=benchmarks&filters=[]` },
        { name: 'UPDATE (PUT)', method: 'PUT', path: `/documents/benchmarks/${TEST_DOC_ID}`, body: { data: { msg: "Updated" } } },
        { name: 'BATCH (POST)', method: 'POST', path: `/documents/batch`, body: { operations: [{ type: 'SET', path: 'benchmarks/b1', data: { v: 1 } }] } }
    ];

    for (const test of tests) {
        process.stdout.write(`Testing ${test.name.padEnd(20)}... `);
        let totalTime = 0;
        let internalTime = '';
        let count = 0;

        for (let i = 0; i < ops; i++) {
            const res = await measure(test.name, test.method, test.path, test.body);
            if (!res.error) {
                totalTime += res.total;
                internalTime = res.internal;
                count++;
            }
        }

        const avg = count > 0 ? (totalTime / count).toFixed(2) : 'ERR';
        console.log(`Avg: ${avg}ms | Edge: ${internalTime}`);
        results.push({ name: test.name, avg, internal: internalTime });
    }

    console.log('\n✅ Cloud Verification Summary complete.');
}

runBenchmark().catch(console.error);

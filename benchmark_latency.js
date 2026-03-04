const { fetch } = require('undici');
const crypto = require('crypto');

const BASE_URL = 'http://127.0.0.1:8787';
const ITERATIONS = 10;

async function benchmark() {
    console.log('🚀 Starting Performance Benchmark...');

    // 1. Setup: Signup & Project
    const email = `benchmark-debug@test.com`;
    let signupRes = await fetch(`${BASE_URL}/platform/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123', fullName: 'Benchmarker' })
    });

    let signupData = await signupRes.json();
    let token = signupData.token;

    if (!token) {
        console.log('⚠️ Signup didn\'t return token, attempting login...');
        const loginRes = await fetch(`${BASE_URL}/platform/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const loginData = await loginRes.json();
        token = loginData.token;
    }

    if (!token) {
        throw new Error(`Auth failed: ${JSON.stringify(signupData)}`);
    }

    const projectRes = await fetch(`${BASE_URL}/platform/projects`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bench Project' })
    });
    const project = await projectRes.json();
    console.log('DEBUG Project Response:', project);
    const apiKey = project.apiKey;
    const workspaceId = project.id;

    console.log(`✅ Setup Complete. Workspace: ${workspaceId}. Running tests...`);

    // 2. Seed Data
    const docId = 'bench-doc-1';
    await fetch(`${BASE_URL}/documents/test-collection/${docId}`, {
        method: 'PUT',
        headers: {
            'X-Telestack-API-Key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: { hello: 'world', score: 100 }, userId: 'system' })
    });

    const testPaths = [
        { name: 'GET Single', url: `/documents/test-collection/${docId}` },
        { name: 'LIST Collection', url: `/documents/test-collection` },
        { name: 'QUERY Filtered', url: `/documents/query?path=test-collection&filters=[{"field":"score","op":"==","value":100}]` }
    ];

    const summary = [];

    for (const test of testPaths) {
        const latencies = [];
        console.log(`\n📊 Testing: ${test.name}`);

        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            const res = await fetch(`${BASE_URL}${test.url}`, {
                headers: { 'X-Telestack-API-Key': apiKey }
            });
            const text = await res.text();
            const duration = performance.now() - start;
            latencies.push(duration);

            const cacheStatus = res.headers.get('X-Cache') || 'NONE';
            const redisKey = res.headers.get('X-Redis-Key') || 'N/A';

            process.stdout.write(` [${cacheStatus}:${duration.toFixed(1)}ms]`);
            if (i === 0) {
                // Initial response check
                if (res.status >= 400) console.log(`   ⚠️ Initial request failed: ${res.status}`);
            }
        }

        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const p95 = latencies.sort((a, b) => a - b)[Math.floor(ITERATIONS * 0.95)];
        summary.push({ Test: test.name, Avg: `${avg.toFixed(2)}ms`, P95: `${p95.toFixed(2)}ms` });
    }

    console.log('\n\n📈 PERFORMANCE SUMMARY:');
    console.table(summary);
    console.log('\n🏁 Benchmark Finished.');
}

benchmark().catch(console.error);

/**
 * Telestack RealtimeDB v4.0 - Concurrency Stress Test
 * Simulates 100+ users writing to a single document concurrently.
 */

const BASE_URL = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev'; // Production URL
const API_KEY = 'tsk_live_stress_test_key_123'; // Update with your actual tsk_ key
const NUM_DOCS = 100;
const CONCURRENT_USERS = 100;
const OPS_PER_USER = 10;
const RESEARCH_MODE = true; // Set to true to output Thesis-ready tables

async function runStressTest() {
    console.log(`\n🚀 STARTING DISTRIBUTED STRESS TEST: ${CONCURRENT_USERS} users @ ${OPS_PER_USER} ops/user across ${NUM_DOCS} docs`);
    console.log(`📍 TARGET COLLECTION: ${BASE_URL}/e2e_test\n`);

    // --- STEP 0: INITIALIZE DOCUMENTS ---
    console.log(`🛠️ Initializing ${NUM_DOCS} documents...`);
    const initPromises = [];
    for (let i = 0; i < NUM_DOCS; i++) {
        const docPath = `e2e_test/doc_${i}`;
        initPromises.push((async () => {
            const res = await fetch(`${BASE_URL}/documents/${docPath}`, {
                method: 'PUT',
                headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { init: true, id: i }, userId: 'system_init' })
            });
            if (!res.ok) throw new Error(`Init failed: ${res.status}`);
            return res;
        })());
    }
    await Promise.all(initPromises);
    console.log("✅ All documents initialized. Starting the distributed storm...\n");

    const latencies = [];
    let successCount = 0;
    let errorCount = 0;

    const startTime = Date.now();

    // Create a batch of promises
    const tasks = [];
    for (let i = 0; i < CONCURRENT_USERS; i++) {
        tasks.push((async (userId) => {
            for (let j = 0; j < OPS_PER_USER; j++) {
                // Distribute across 100 documents (2-segment path)
                const docIdx = (userId + j) % NUM_DOCS;
                const docPath = `e2e_test/doc_${docIdx}`;

                const opStart = Date.now();
                try {
                    const response = await fetch(`${BASE_URL}/documents/${docPath}`, {
                        method: 'PATCH',
                        headers: {
                            'X-API-Key': API_KEY,
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache'
                        },
                        body: JSON.stringify({
                            data: { [`update_from_user_${userId}`]: Date.now() },
                            userId: `user_${userId}`
                        })
                    });

                    const duration = Date.now() - opStart;
                    latencies.push(duration);

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                        console.error(`❌ User ${userId} -> Doc ${docIdx} failed: ${response.status}`);
                    }
                } catch (e) {
                    errorCount++;
                    console.error(`🔥 User ${userId} -> Doc ${docIdx} Error: ${e.message}`);
                }
            }
        })(i));
    }

    await Promise.all(tasks);
    const totalDuration = Date.now() - startTime;

    // Report Results
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`\n=========================================`);
    console.log(`📊 STRESS TEST RESULTS`);
    console.log(`=========================================`);
    console.log(`Total Requests:  ${successCount + errorCount}`);
    console.log(`Success Rate:    ${((successCount / (successCount + errorCount)) * 100).toFixed(2)}%`);
    console.log(`Total Time:      ${totalDuration}ms`);
    console.log(`Throughput:      ${((successCount + errorCount) / (totalDuration / 1000)).toFixed(2)} ops/sec`);
    console.log(`-----------------------------------------`);
    console.log(`Min Latency:     ${latencies[0]}ms`);
    console.log(`Avg Latency:     ${avg.toFixed(2)}ms`);
    console.log(`p50 (Median):    ${p50}ms ⚡`);
    console.log(`p95 Latency:     ${p95}ms`);
    console.log(`p99 Latency:     ${p99}ms`);
    console.log(`Max Latency:     ${latencies[latencies.length - 1]}ms`);
    console.log(`=========================================`);

    if (RESEARCH_MODE) {
        console.log(`\n📑 RESEARCH PROOF (Copy this to your Thesis)`);
        console.log(`-----------------------------------------`);
        console.log(`| Metric | Value |`);
        console.log(`| :--- | :--- |`);
        console.log(`| Concurrency | ${CONCURRENT_USERS} users |`);
        console.log(`| Throughput | ${((successCount + errorCount) / (totalDuration / 1000)).toFixed(2)} ops/s |`);
        console.log(`| average Latency | ${avg.toFixed(2)}ms |`);
        console.log(`| p50 (Median) | ${p50}ms |`);
        console.log(`| p95 (Tail) | ${p95}ms |`);
        console.log(`| Reliability | ${((successCount / (successCount + errorCount)) * 100).toFixed(2)}% |`);
        console.log(`-----------------------------------------\n`);
    }
}

// Ensure fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
    console.error("❌ Error: Use Node.js 18+ or install 'node-fetch'");
    process.exit(1);
}

runStressTest().catch(console.error);

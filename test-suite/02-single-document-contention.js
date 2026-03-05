/**
 * Single-Document Contention Test - 100 Users, 1 Document
 * Tests AENS write buffering under extreme contention
 * This is the hardest test case (worst-case scenario)
 * 
 * Usage: node 02-single-document-contention.js
 * Output: Thesis-ready benchmark table
 */

const BASE_URL = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const API_KEY = 'tsk_live_stress_test_key_123'; // Update with your actual tsk_ key
const DOC_PATH = 'e2e_test/concurrency_bomb';
const CONCURRENT_USERS = 100;
const OPS_PER_USER = 10;
const RESEARCH_MODE = true; // Set to true to output Thesis-ready tables

async function runStressTest() {
    console.log(`\n🚀 STARTING SINGLE-DOCUMENT CONTENTION TEST`);
    console.log(`${CONCURRENT_USERS} users @ ${OPS_PER_USER} ops/user → 1 shared document`);
    console.log(`📍 TARGET: ${BASE_URL}/${DOC_PATH}\n`);

    // --- STEP 0: INITIALIZE DOCUMENT ---
    console.log("🛠️ Initializing single document...");
    const initRes = await fetch(`${BASE_URL}/documents/${DOC_PATH}`, {
        method: 'PUT',
        headers: {
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            data: { init: true, timestamp: Date.now() },
            userId: 'system_init'
        })
    });

    if (!initRes.ok) {
        console.error(`❌ Failed to initialize document: ${initRes.status}`);
        process.exit(1);
    }
    console.log("✅ Document initialized. Starting the contention storm...\n");

    const latencies = [];
    let successCount = 0;
    let errorCount = 0;

    const startTime = Date.now();

    // Create a batch of promises - ALL users write to SAME document
    const tasks = [];
    for (let i = 0; i < CONCURRENT_USERS; i++) {
        tasks.push((async (userId) => {
            for (let j = 0; j < OPS_PER_USER; j++) {
                const opStart = Date.now();
                try {
                    const response = await fetch(`${BASE_URL}/documents/${DOC_PATH}`, {
                        method: 'PATCH',
                        headers: {
                            'X-API-Key': API_KEY,
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache' // Bypass client cache to stress the edge
                        },
                        body: JSON.stringify({
                            data: { [`user_${userId}`]: `update_${j}_${Date.now()}` },
                            userId: `user_${userId}`
                        })
                    });

                    const duration = Date.now() - opStart;
                    latencies.push(duration);

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                        console.error(`❌ User ${userId} Op ${j} failed: ${response.status}`);
                    }
                } catch (e) {
                    errorCount++;
                    console.error(`🔥 User ${userId} Op ${j} Error: ${e.message}`);
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
    const throughput = ((successCount + errorCount) / (totalDuration / 1000)).toFixed(2);
    const reliability = ((successCount / (successCount + errorCount)) * 100).toFixed(2);

    console.log(`\n=========================================`);
    console.log(`📊 SINGLE-DOCUMENT CONTENTION RESULTS`);
    console.log(`=========================================`);
    console.log(`Total Requests:  ${successCount + errorCount}`);
    console.log(`Success Rate:    ${reliability}%`);
    console.log(`Total Time:      ${totalDuration}ms`);
    console.log(`Throughput:      ${throughput} ops/sec`);
    console.log(`-----------------------------------------`);
    console.log(`Min Latency:     ${latencies[0]}ms`);
    console.log(`Avg Latency:     ${avg.toFixed(2)}ms`);
    console.log(`p50 (Median):    ${p50}ms ⚡ (target: <300ms)`);
    console.log(`p95 Latency:     ${p95}ms`);
    console.log(`p99 Latency:     ${p99}ms`);
    console.log(`Max Latency:     ${latencies[latencies.length - 1]}ms`);
    console.log(`=========================================`);

    if (RESEARCH_MODE) {
        console.log(`\n📑 THESIS-READY OUTPUT (Copy to LaTeX Table)`);
        console.log(`-----------------------------------------`);
        console.log(`Throughput  | p50 (ms) | p95 (ms) | p99 (ms) | Reliability`);
        console.log(`${throughput} ops/s | ${p50} | ${p95} | ${p99} | ${reliability}%`);
        console.log(`-----------------------------------------\n`);
    }
}

// Ensure fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
    console.error("❌ Error: Use Node.js 18+ or install 'node-fetch'");
    process.exit(1);
}

runStressTest().catch(console.error);

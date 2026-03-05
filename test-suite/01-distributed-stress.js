/**
 * Distributed Stress Test - 100 Users, 100 Documents
 * Tests AENS algorithm under distributed workload with TRUE CONCURRENCY
 * 
 * Methodology:
 * - TRUE concurrent operations per user (all OPS_PER_USER operations fire simultaneously)
 * - Warmup run before measurement (allows cold start initialization)
 * - All-or-nothing success metric (entire operation sequence must succeed)
 * - Latency split: internal (server) vs end-to-end (user experience)
 * 
 * Usage: 
 *   API_KEY="your_key" node 01-distributed-stress.js
 * 
 * Output: 
 *   - Thesis-ready benchmark table
 *   - Internal and end-to-end latencies
 *   - Success rate per user
 */

const BASE_URL = process.env.TELESTACK_URL || 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const API_KEY = process.env.API_KEY || process.env.TELESTACK_KEY;
const NUM_DOCS = 100;
const CONCURRENT_USERS = 100;
const OPS_PER_USER = 10;
const RESEARCH_MODE = true;
const ENABLE_WARMUP = true; // IMPORTANT: Warmup before measurement

if (!API_KEY) {
    console.error('❌ Error: Set API_KEY environment variable');
    console.error('   Usage: API_KEY="your_key" node 01-distributed-stress.js');
    process.exit(1);
}

async function runStressTest() {
    console.log(`\n🚀 DISTRIBUTED STRESS TEST: ${CONCURRENT_USERS} users, ${NUM_DOCS} docs, ${OPS_PER_USER} ops/user`);
    console.log(`📍 Concurrency model: TRUE concurrent (all ops/user fire simultaneously)`);
    console.log(`📊 Latency captured: Internal (Wasm) + End-to-end (network + Wasm)\n`);

    // --- STEP 0: INITIALIZE DOCUMENTS ---
    console.log(`🛠️  Initializing ${NUM_DOCS} documents...`);
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
    console.log("✅ Documents initialized.\n");

    // --- STEP 1: WARMUP (cold start initialization) ---
    if (ENABLE_WARMUP) {
        console.log("🔥 Running warmup (allows cold start initialization)...");
        const warmupOps = [];
        for (let i = 0; i < 10; i++) {
            warmupOps.push(
                fetch(`${BASE_URL}/documents/e2e_test/doc_0`, {
                    method: 'PATCH',
                    headers: {
                        'X-API-Key': API_KEY,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    body: JSON.stringify({ data: { warmup: true }, userId: 'warmup' })
                }).catch(() => {})
            );
        }
        await Promise.all(warmupOps);
        console.log("✅ Warmup complete. Sleeping 3 seconds for JIT compilation...\n");
        await new Promise(r => setTimeout(r, 3000));
    }

    // --- STEP 2: REAL BENCHMARK ---
    console.log("📊 Starting actual benchmark...\n");
    const latencies = [];
    let userSuccesses = 0;
    let userFailures = 0;

    const startTime = Date.now();

    // Create tasks - each user fires ALL operations truly concurrently
    const userTasks = [];
    for (let userId = 0; userId < CONCURRENT_USERS; userId++) {
        userTasks.push((async () => {
            // Fire all operations for this user CONCURRENTLY (not sequentially!)
            const opPromises = [];
            for (let j = 0; j < OPS_PER_USER; j++) {
                const docIdx = (userId + j) % NUM_DOCS;
                const docPath = `e2e_test/doc_${docIdx}`;
                const opStart = Date.now();

                opPromises.push(
                    fetch(`${BASE_URL}/documents/${docPath}`, {
                        method: 'PATCH',
                        headers: {
                            'X-API-Key': API_KEY,
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache'
                        },
                        body: JSON.stringify({
                            data: { [`user_${userId}`]: Date.now() },
                            userId: `user_${userId}`
                        })
                    })
                        .then(res => {
                            const duration = Date.now() - opStart;
                            const internalLatency = res.headers.get('X-Internal-Latency');
                            latencies.push({
                                e2e: duration,
                                internal: internalLatency ? parseInt(internalLatency) : null,
                                success: res.ok
                            });
                            return res.ok;
                        })
                        .catch(e => {
                            latencies.push({ e2e: Date.now() - opStart, internal: null, success: false });
                            return false;
                        })
                );
            }

            // All-or-nothing: entire batch is success only if all operations succeeded
            const results = await Promise.all(opPromises);
            const batchSuccess = results.every(r => r === true);
            if (batchSuccess) {
                userSuccesses++;
            } else {
                userFailures++;
            }
        })());
    }

    await Promise.all(userTasks);
    const totalDuration = Date.now() - startTime;

    // Report Results
    const e2eLatencies = latencies.map(l => l.e2e).sort((a, b) => a - b);
    const internalLatencies = latencies.filter(l => l.internal !== null).map(l => l.internal).sort((a, b) => a - b);
    
    const p50_e2e = e2eLatencies[Math.floor(e2eLatencies.length * 0.5)];
    const p95_e2e = e2eLatencies[Math.floor(e2eLatencies.length * 0.95)];
    const p99_e2e = e2eLatencies[Math.floor(e2eLatencies.length * 0.99)];
    const avg_e2e = e2eLatencies.reduce((a, b) => a + b, 0) / e2eLatencies.length;
    
    const p50_internal = internalLatencies.length > 0 ? internalLatencies[Math.floor(internalLatencies.length * 0.5)] : 0;
    const avg_internal = internalLatencies.length > 0 ? internalLatencies.reduce((a, b) => a + b, 0) / internalLatencies.length : 0;
    
    const reliability = ((userSuccesses / (userSuccesses + userFailures)) * 100).toFixed(2);
    const throughput = ((userSuccesses * OPS_PER_USER) / (totalDuration / 1000)).toFixed(2);

    console.log(`\n=========================================`);
    console.log(`📊 DISTRIBUTED STRESS TEST RESULTS`);
    console.log(`=========================================`);
    console.log(`User batches:     ${userSuccesses + userFailures} (${userSuccesses} success, ${userFailures} failed)`);
    console.log(`Total ops:        ${userSuccesses * OPS_PER_USER + userFailures * OPS_PER_USER}`);
    console.log(`User reliability: ${reliability}%`);
    console.log(`Total time:       ${totalDuration}ms`);
    console.log(`Throughput:       ${throughput} ops/sec`);
    console.log(`-----------------------------------------`);
    console.log(`INTERNAL LATENCY (Wasm engine only):`);
    console.log(`  p50:            ${p50_internal}ms (median)`);
    console.log(`  avg:            ${avg_internal.toFixed(2)}ms`);
    console.log(`-----------------------------------------`);
    console.log(`END-TO-END LATENCY (network + Wasm):`);
    console.log(`  min:            ${e2eLatencies[0]}ms`);
    console.log(`  avg:            ${avg_e2e.toFixed(2)}ms`);
    console.log(`  p50:            ${p50_e2e}ms (what users see) ⚡`);
    console.log(`  p95:            ${p95_e2e}ms (tail latency)`);
    console.log(`  p99:            ${p99_e2e}ms (extreme outliers)`);
    console.log(`  max:            ${e2eLatencies[e2eLatencies.length - 1]}ms`);
    console.log(`=========================================`);

    if (RESEARCH_MODE) {
        console.log(`\n📑 THESIS-READY OUTPUT`);
        console.log(`-----------------------------------------`);
        console.log(`Throughput  | p50 (ms) | p95 (ms) | p99 (ms) | User Reliability`);
        console.log(`${throughput} ops/s | ${p50_e2e} | ${p95_e2e} | ${p99_e2e} | ${reliability}%`);
        console.log(`-----------------------------------------\n`);
    }
}

// Ensure fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
    console.error("❌ Error: Use Node.js 18+ or install 'node-fetch'");
    process.exit(1);
}

runStressTest().catch(console.error);

/**
 * Cloud Platform Comparison Benchmark
 * Telestack vs Firebase vs Supabase vs MongoDB
 * 
 * Usage: 
 *   node 03-cloud-comparison.js telestack    # Run Telestack benchmark
 *   node 03-cloud-comparison.js firebase     # Run Firebase benchmark
 *   node 03-cloud-comparison.js supabase     # Run Supabase benchmark
 *   node 03-cloud-comparison.js mongodb      # Run MongoDB benchmark
 *   node 03-cloud-comparison.js all          # Run all platforms sequentially
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONCURRENT_USERS = 100;
const OPS_PER_USER = 10;
const TOTAL_REQUESTS = CONCURRENT_USERS * OPS_PER_USER;

const TARGET_SERVICE = process.argv[2] || 'telestack';

// --- Telestack (Cloud Production) ---
const TELESTACK_URL = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const TELESTACK_KEY = 'tsk_live_paint_demo_key_999';
const TELESTACK_WORKSPACE = 'benchmark_cloud_test';

// --- Firebase (Admin SDK) ---
const FIREBASE_SERVICE_ACCOUNT = './firebase-service-account.json';

// --- Supabase (REST/Postgres) ---
const SUPABASE_URL = 'https://wsfmchmmriajbvptpfxr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZm1jaG1tcmlhamJ2cHRwZnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDEyMTYsImV4cCI6MjA4NzU3NzIxNn0.k6Xpc5rHM31OtdyZZyd4xpM9wWu2isDim-3KAtmq7Ss';

// --- MongoDB (Atlas) ---
const MONGO_URI = 'mongodb+srv://user:password@cluster.mongodb.net/?appName=benchmark';
const MONGO_DB_NAME = 'benchmark';

// =============================================================================
// IMPLEMENTATIONS
// =============================================================================

let db, collection;

const implementations = {
    telestack: {
        initialize: async () => {
            console.log('🚀 Telestack Cloud initialized');
        },
        create: async (id, data) => {
            const res = await fetch(`${TELESTACK_URL}/v1/documents/bench`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${TELESTACK_KEY}`, 
                    'x-workspace': TELESTACK_WORKSPACE, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ data, docId: id })
            });
            return res.json();
        },
        read: async (id) => {
            const res = await fetch(`${TELESTACK_URL}/v1/documents/bench/${id}`, {
                headers: { 
                    'Authorization': `Bearer ${TELESTACK_KEY}`, 
                    'x-workspace': TELESTACK_WORKSPACE 
                }
            });
            return res.json();
        },
        update: async (id, data) => {
            const res = await fetch(`${TELESTACK_URL}/v1/documents/bench/${id}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${TELESTACK_KEY}`, 
                    'x-workspace': TELESTACK_WORKSPACE, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ data })
            });
            return res.json();
        },
        delete: async (id) => {
            await fetch(`${TELESTACK_URL}/v1/documents/bench/${id}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${TELESTACK_KEY}`, 
                    'x-workspace': TELESTACK_WORKSPACE 
                }
            });
        }
    },
    firebase: {
        initialize: async () => {
            const { initializeApp, cert } = require('firebase-admin/app');
            const { getFirestore } = require('firebase-admin/firestore');
            initializeApp({ credential: cert(require(FIREBASE_SERVICE_ACCOUNT)) });
            db = getFirestore();
            collection = db.collection('benchmark');
            console.log('🔥 Firebase initialized');
        },
        create: async (id, data) => collection.doc(id).set(data),
        read: async (id) => collection.doc(id).get(),
        update: async (id, data) => collection.doc(id).update(data),
        delete: async (id) => collection.doc(id).delete()
    },
    supabase: {
        initialize: async () => {
            const { createClient } = require('@supabase/supabase-js');
            db = createClient(SUPABASE_URL, SUPABASE_KEY);
            collection = 'benchmark';
            console.log('🐘 Supabase initialized');
        },
        create: async (id, data) => db.from(collection).upsert([{ id, ...data }]),
        read: async (id) => db.from(collection).select('*').eq('id', id).single(),
        update: async (id, data) => db.from(collection).update(data).eq('id', id),
        delete: async (id) => db.from(collection).delete().eq('id', id)
    },
    mongodb: {
        initialize: async () => {
            const { MongoClient } = require('mongodb');
            const client = new MongoClient(MONGO_URI);
            await client.connect();
            db = client.db(MONGO_DB_NAME);
            collection = db.collection('benchmark');
            console.log('🍃 MongoDB initialized');
        },
        create: async (id, data) => collection.insertOne({ _id: id, ...data }),
        read: async (id) => collection.findOne({ _id: id }),
        update: async (id, data) => collection.updateOne({ _id: id }, { $set: data }),
        delete: async (id) => collection.deleteOne({ _id: id })
    }
};

// =============================================================================
// BENCHMARK RUNNER
// =============================================================================

async function runBenchmark(service) {
    console.log(`\n=========================================`);
    console.log(`🔬 CLOUD BENCHMARK: ${service.toUpperCase()}`);
    console.log(`=========================================`);
    console.log(`Concurrency: ${CONCURRENT_USERS} users`);
    console.log(`Operations per user: ${OPS_PER_USER}`);
    console.log(`Total operations: ${TOTAL_REQUESTS}`);
    console.log(`Operation mix: CREATE → READ → UPDATE → DELETE\n`);

    const impl = implementations[service];
    await impl.initialize();

    const latencies = [];
    let successes = 0;
    let failures = 0;
    const startTime = Date.now();

    // Run concurrent work
    const work = Array.from({ length: CONCURRENT_USERS }).map(async (_, i) => {
        for (let j = 0; j < OPS_PER_USER; j++) {
            const id = `bench_${service}_${i}_${j}`;
            const opStart = Date.now();
            try {
                await impl.create(id, { val: Math.random(), user: i, ts: Date.now() });
                await impl.read(id);
                await impl.update(id, { val: Math.random(), status: 'updated' });
                await impl.delete(id);
                successes++;
            } catch (e) {
                failures++;
            }
            latencies.push(Date.now() - opStart);
        }
    });

    await Promise.all(work);
    const duration = Date.now() - startTime;

    // Calculate statistics
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const throughput = (successes / (duration / 1000)).toFixed(2);
    const reliability = ((successes / TOTAL_REQUESTS) * 100).toFixed(2);

    console.log(`\n📊 BENCHMARK RESULTS`);
    console.log(`=========================================`);
    console.log(`Successes:       ${successes}/${TOTAL_REQUESTS}`);
    console.log(`Failures:        ${failures}`);
    console.log(`Reliability:     ${reliability}%`);
    console.log(`Total Time:      ${duration}ms`);
    console.log(`Throughput:      ${throughput} ops/sec ⚡`);
    console.log(`-----------------------------------------`);
    console.log(`Avg Latency:     ${avg.toFixed(2)}ms`);
    console.log(`p50 Latency:     ${p50}ms`);
    console.log(`p95 Latency:     ${p95}ms`);
    console.log(`p99 Latency:     ${p99}ms`);
    console.log(`=========================================\n`);

    return {
        service,
        throughput: parseFloat(throughput),
        latency: avg,
        p50,
        p95,
        p99,
        reliability: parseFloat(reliability),
        duration
    };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    const results = [];

    if (TARGET_SERVICE === 'all') {
        for (const service of Object.keys(implementations)) {
            try {
                const result = await runBenchmark(service);
                results.push(result);
            } catch (e) {
                console.error(`❌ ${service} benchmark failed:`, e.message);
            }
        }

        // Comparison table
        console.log(`\n════════════════════════════════════════════════════════════════════`);
        console.log(`📊 COMPARATIVE RESULTS TABLE`);
        console.log(`════════════════════════════════════════════════════════════════════`);
        console.log(`Service     | Throughput | Avg Latency | p50 | p95 | Reliability`);
        console.log(`─────────────┼────────────┼─────────────┼─────┼─────┼────────────`);
        results.forEach(r => {
            console.log(`${r.service.padEnd(11)} | ${String(r.throughput).padStart(10)} | ${String(r.latency.toFixed(2)).padStart(11)} | ${String(r.p50).padStart(3)} | ${String(r.p95).padStart(3)} | ${r.reliability.toFixed(2)}%`);
        });
        console.log(`════════════════════════════════════════════════════════════════════\n`);

        // Methodology note
        console.log(`📝 BENCHMARK METHODOLOGY NOTE:`);
        console.log(`   • Telestack: HTTP REST API from single client location`);
        console.log(`   • Firebase: Admin SDK (server-to-server, optimized pathway)`);
        console.log(`   • Supabase: HTTP REST API (equivalent to Telestack)`);
        console.log(`   • Workload: 100 concurrent users, 10 operations each (1000 total ops)`);
        console.log(`   • Measurements: Taken from single Node.js process`);
        console.log(`   • Results: Indicative of relative performance in this configuration\n`);

        // Calculate improvements
        const telestack = results.find(r => r.service === 'telestack');
        if (telestack) {
            console.log(`🏆 TELESTACK IMPROVEMENTS`);
            results.forEach(r => {
                if (r.service !== 'telestack') {
                    const throughputGain = (telestack.throughput / r.throughput).toFixed(2);
                    const latencyGain = (r.latency / telestack.latency).toFixed(2);
                    console.log(`   vs ${r.service.toUpperCase()}: ${throughputGain}× higher throughput, ${latencyGain}× lower latency`);
                }
            });
            console.log(`\n   ⚠️  Note: Firebase uses Admin SDK (optimized). Supabase uses REST API (comparable to Telestack).`);
        }
    } else {
        const result = await runBenchmark(TARGET_SERVICE);
        results.push(result);
    }
}

main().catch(console.error);

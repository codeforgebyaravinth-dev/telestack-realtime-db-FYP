const fetch = require('node-fetch');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONCURRENT_USERS = 100;
const OPS_PER_USER = 10;
const TOTAL_REQUESTS = CONCURRENT_USERS * OPS_PER_USER;

// Target Service: 'telestack', 'firebase', 'supabase', 'mongodb'
const TARGET_SERVICE = process.argv[2] || 'telestack';

// --- Telestack (Cloud Production) ---
const TELESTACK_URL = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const TELESTACK_KEY = 'tsk_live_paint_demo_key_999';
const TELESTACK_WORKSPACE = 'benchmark_cloud_test';

// --- Firebase (Admin SDK) ---
const FIREBASE_SERVICE_ACCOUNT = './service.json';

// --- Supabase (REST/Postgres) ---
const SUPABASE_URL = 'https://wsfmchmmriajbvptpfxr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZm1jaG1tcmlhamJ2cHRwZnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDEyMTYsImV4cCI6MjA4NzU3NzIxNn0.k6Xpc5rHM31OtdyZZyd4xpM9wWu2isDim-3KAtmq7Ss';

// --- MongoDB (Atlas) ---
const MONGO_URI = 'mongodb+srv://codeforgebyaravinth_db_user:YOUR_PASSWORD@auracluster.egxxqle.mongodb.net/?appName=AuraCluster';
const MONGO_DB_NAME = 'benchmark';

// =============================================================================
// IMPLEMENTATIONS
// =============================================================================

let db, collection;

const implementations = {
    telestack: {
        initialize: async () => console.log('🚀 Telestack Cloud Initialized'),
        create: async (id, data) => {
            const res = await fetch(`${TELESTACK_URL}/v1/documents/bench`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${TELESTACK_KEY}`, 'x-workspace': TELESTACK_WORKSPACE, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, docId: id })
            });
            return res.json();
        },
        read: async (id) => {
            const res = await fetch(`${TELESTACK_URL}/v1/documents/bench/${id}`, {
                headers: { 'Authorization': `Bearer ${TELESTACK_KEY}`, 'x-workspace': TELESTACK_WORKSPACE }
            });
            return res.json();
        },
        update: async (id, data) => {
            const res = await fetch(`${TELESTACK_URL}/v1/documents/bench/${id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${TELESTACK_KEY}`, 'x-workspace': TELESTACK_WORKSPACE, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data })
            });
            return res.json();
        },
        delete: async (id) => {
            await fetch(`${TELESTACK_URL}/v1/documents/bench/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${TELESTACK_KEY}`, 'x-workspace': TELESTACK_WORKSPACE }
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
            collection = db.collection('test');
        },
        create: async (id, data) => collection.insertOne({ _id: id, ...data }),
        read: async (id) => collection.findOne({ _id: id }),
        update: async (id, data) => collection.updateOne({ _id: id }, { $set: data }),
        delete: async (id) => collection.deleteOne({ _id: id })
    }
};

// =============================================================================
// RUNNER
// =============================================================================

async function runBenchmark() {
    console.log(`\n=========================================`);
    console.log(`� CLOUD BENCHMARK: ${TARGET_SERVICE.toUpperCase()}`);
    console.log(`=========================================`);

    const impl = implementations[TARGET_SERVICE];
    await impl.initialize();

    const latencies = [];
    let successes = 0;
    const startTime = Date.now();

    const work = Array.from({ length: CONCURRENT_USERS }).map(async (_, i) => {
        for (let j = 0; j < OPS_PER_USER; j++) {
            const id = `bench_${TARGET_SERVICE}_${i}_${j}`;
            const opStart = Date.now();
            try {
                await impl.create(id, { val: Math.random(), user: i });
                await impl.read(id);
                await impl.update(id, { val: Math.random(), status: 'updated' });
                await impl.delete(id);
                successes++;
            } catch (e) { }
            latencies.push(Date.now() - opStart);
        }
    });

    await Promise.all(work);
    const duration = Date.now() - startTime;

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const throughput = (successes / duration) * 1000;

    console.log(`Success Rate:    ${((successes / TOTAL_REQUESTS) * 100).toFixed(2)}%`);
    console.log(`Throughput:      ${throughput.toFixed(2)} ops/sec`);
    console.log(`p50 Latency:     ${p50}ms`);
    console.log(`Total Time:      ${duration}ms`);
    console.log('=========================================\n');
}

runBenchmark().catch(console.error);

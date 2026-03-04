const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';

async function runBenchmark() {
    console.log("🚀 Starting E2E WASM Database Benchmark...\n");

    const projectName = "BenchmarkProject_" + Date.now();
    const projectId = "proj_" + Math.random().toString(36).substring(7);
    const apiKey = "tsk_live_" + Math.random().toString(36).substring(7);

    // 1. Setup Phase: Create Project
    console.log("Setting up test project...");
    const setupRes = await fetch(`${BASE_URL}/admin/projects`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer benchmark_token'
        },
        body: JSON.stringify({
            name: projectName,
            project_id: projectId,
            owner_id: "user_benchmark",
            owner_email: "benchmark@telestack.local",
            api_key: apiKey
        })
    });

    if (!setupRes.ok) {
        console.error("❌ Setup failed:", await setupRes.text());
        return;
    }
    console.log("✅ Project created.\n");

    const commonHeaders = {
        'Content-Type': 'application/json',
        'X-Telestack-API-Key': apiKey
    };

    // 2. Cold Write (Hits D1 + WASM CRDT Merge on Coalesce)
    console.log("--- 1. Cold Write (Buffered) ---");
    const writeStart = performance.now();
    const writeRes = await fetch(`${BASE_URL}/posts`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({
            data: {
                title: "Hello WASM",
                content: "Initial content",
                version: 1,
                tags: ["test", "wasm"]
            },
            userId: "benchmark_user"
        })
    });

    if (!writeRes.ok) {
        console.error(`❌ Write failed (Status: ${writeRes.status}):`, await writeRes.text());
        return;
    }

    const writeData = await writeRes.json() as any;
    const writeTime = performance.now() - writeStart;
    console.log(`Latency (Total): ${writeTime.toFixed(2)}ms`);
    console.log(`Internal Latency: ${writeRes.headers.get('X-Internal-Latency') || 'N/A'}`);
    console.log(`Mode: ${writeRes.headers.get('X-Write-Mode') || 'N/A'}`);
    console.log(`Path: ${writeData.path}\n`);

    const docPath = writeData.path; // This is "posts/90772daa-5a30-4cc6-a0a7-fd1b0a7219ec"
    const docId = docPath.split('/').pop(); // Extract just the ID

    // Wait for buffer flush
    await new Promise(r => setTimeout(r, 2000));

    // 3. Cold Read - FIXED URL STRUCTURE
    console.log("--- 2. Cold Read (D1/KV Hit) ---");
    const coldReadStart = performance.now();

    // FIX: Use the correct documents endpoint format
    const readUrl = `${BASE_URL}/documents/${docPath}`;
    console.log(`Fetching: ${readUrl}`);

    let coldReadTime: number | undefined;
    try {
        const coldReadRes = await fetch(readUrl, {
            method: 'GET',
            headers: commonHeaders
        });

        console.log(`Cold Read Finished. Status: ${coldReadRes.status}`);

        if (!coldReadRes.ok) {
            console.error(`❌ Cold Read failed (Status: ${coldReadRes.status}):`, await coldReadRes.text());
            return;
        }

        coldReadTime = performance.now() - coldReadStart;
        const coldReadData = await coldReadRes.json() as any;

        console.log(`Latency (Total): ${coldReadTime.toFixed(2)}ms`);
        console.log(`Internal Latency: ${coldReadRes.headers.get('X-Internal-Latency')}`);
        console.log(`Cache: ${coldReadRes.headers.get('X-Cache')}`);
        console.log(`Document Data:`, JSON.stringify(coldReadData.data || coldReadData), '\n');
    } catch (err: any) {
        console.error("❌ Cold Read Fetch Error:", err.message);
        return;
    }

    // 4. Hot Read (Hits WASM Bloom + Memory Cache)
    console.log("--- 3. Hot Reads (WASM + Tier 0 Memory) ---");
    const hotLatencies: number[] = [];
    const hotTotalLatencies: number[] = [];

    let avgHotInternal = 0;
    let avgHotTotal = 0;

    for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const res = await fetch(readUrl, {
            method: 'GET',
            headers: commonHeaders
        });
        const end = performance.now();

        if (!res.ok) {
            console.error(`❌ Hot Read ${i + 1} failed:`, await res.text());
            continue;
        }

        const internalLatency = parseFloat(res.headers.get('X-Internal-Latency')?.replace('ms', '') || '0');
        hotLatencies.push(internalLatency);
        hotTotalLatencies.push(end - start);

        console.log(`Iteration ${i + 1}: Internal: ${internalLatency}ms | Total: ${(end - start).toFixed(2)}ms | Cache: ${res.headers.get('X-Cache')}`);
    }

    if (hotLatencies.length > 0) {
        avgHotInternal = hotLatencies.reduce((a, b) => a + b, 0) / hotLatencies.length;
        avgHotTotal = hotTotalLatencies.reduce((a, b) => a + b, 0) / hotTotalLatencies.length;

        console.log(`\n🔥 Average Hot Internal Latency: ${avgHotInternal.toFixed(4)}ms`);
        console.log(`🔥 Average Hot Total Latency: ${avgHotTotal.toFixed(2)}ms`);

        if (avgHotInternal < 10) {
            console.log("\n✅ SUCCESS: Achieved sub-10ms internal latency with WASM optimizations!");
        } else {
            console.log("\n⚠️ WARNING: Internal latency above 10ms target.");
        }
    }

    // 5. WASM CRDT Conflict Test
    console.log("\n--- 4. WASM CRDT Conflict Resolution (Deep Merge) ---");

    const update1 = fetch(`${BASE_URL}/documents/${docPath}`, {
        method: 'PATCH',
        headers: commonHeaders,
        body: JSON.stringify({ data: { category: "benchmark" } })
    });

    const update2 = fetch(`${BASE_URL}/documents/${docPath}`, {
        method: 'PATCH',
        headers: commonHeaders,
        body: JSON.stringify({ data: { author: "WASM_Engine" } })
    });

    const [r1, r2] = await Promise.all([update1, update2]);
    console.log(`Dispatched concurrent updates... Statuses: ${r1.status}, ${r2.status}`);
    if (!r1.ok) console.error("Update 1 failed:", await r1.text());
    if (!r2.ok) console.error("Update 2 failed:", await r2.text());

    await new Promise(r => setTimeout(r, 1000));

    const finalRes = await fetch(readUrl, {
        method: 'GET',
        headers: {
            ...commonHeaders,
            'Cache-Control': 'no-cache'
        }
    });

    if (!finalRes.ok) {
        console.error("❌ Final read failed:", await finalRes.text());
        return;
    }

    const finalData = await finalRes.json() as any;
    const docData = finalData.data || finalData;

    if (docData.category === "benchmark" && docData.author === "WASM_Engine") {
        console.log("✅ CRDT Merge Success: Concurrent edits preserved!");
        console.log("   Document now has both fields:", JSON.stringify(docData));
    } else {
        console.log("❌ CRDT Merge Failed.");
        console.log("   Expected both 'category' and 'author' fields");
        console.log("   Got:", JSON.stringify(docData));
    }

    // 6. Performance Metrics Summary
    console.log("\n--- 5. BENCHMARK SUMMARY ---");
    console.log(`Write Latency: ${writeTime.toFixed(2)}ms`);
    console.log(`Cold Read Latency (Total): ${coldReadTime?.toFixed(2) || 'N/A'}ms`);
    console.log(`Hot Read Avg (Internal): ${avgHotInternal.toFixed(2)}ms`);
    console.log(`Hot Read Avg (Total): ${avgHotTotal.toFixed(2)}ms`);
    console.log(`CRDT Merge: ${docData.category === "benchmark" && docData.author === "WASM_Engine" ? '✅' : '❌'}`);
}

runBenchmark().catch(console.error);

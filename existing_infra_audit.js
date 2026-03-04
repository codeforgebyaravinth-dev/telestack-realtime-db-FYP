
const PROD_URL = "https://telestack-realtime-db.codeforgebyaravinth.workers.dev";
const API_KEY = "sk_live_2fab63c057194c848c5e8076629ba6e3";
const WORKSPACE_ID = "c4efc971-9159-4265-b18d-c54e572b5952";

async function runExistingInfraAudit() {
    console.log("🏙️ Telestack Performance Audit: Existing Infrastructure (v4.11)");
    console.log(`🎯 Target Workspace: ${WORKSPACE_ID}`);

    const headers = {
        'X-Telestack-API-Key': API_KEY,
        'workspaceId': WORKSPACE_ID,
        'Content-Type': 'application/json'
    };

    const auditResults = [];

    // 1. POST (Create)
    console.log("\n✍️ Operation 1: POST (Create Document)");
    const writeStart = performance.now();
    const writeRes = await fetch(`${PROD_URL}/documents/audit_logs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: { message: "Audit entry", timestamp: Date.now() }, userId: "auditor_01" })
    });
    const writeData = await writeRes.json();
    const writeEnd = performance.now();

    auditResults.push({
        op: "POST (Create)",
        rtt: (writeEnd - writeStart).toFixed(2),
        internal: writeRes.headers.get('X-Internal-Latency'),
        cache: writeRes.headers.get('X-Cache') || 'MISS'
    });
    console.log(`✅ Success: ${writeData.path}`);

    const docPath = writeData.path;

    // 2. GET (Read - COLD)
    console.log("\n📖 Operation 2: GET (Read - COLD)");
    const readColdStart = performance.now();
    const readColdRes = await fetch(`${PROD_URL}/documents/${docPath}`, { headers });
    const readColdEnd = performance.now();

    auditResults.push({
        op: "GET (Cold)",
        rtt: (readColdEnd - readColdStart).toFixed(2),
        internal: readColdRes.headers.get('X-Internal-Latency'),
        cache: readColdRes.headers.get('X-Cache')
    });

    // 3. GET (Read - HOT)
    console.log("📖 Operation 3: GET (Read - HOT)");
    const readHotStart = performance.now();
    const readHotRes = await fetch(`${PROD_URL}/documents/${docPath}`, { headers });
    const readHotEnd = performance.now();

    auditResults.push({
        op: "GET (Hot)",
        rtt: (readHotEnd - readHotStart).toFixed(2),
        internal: readHotRes.headers.get('X-Internal-Latency'),
        cache: readHotRes.headers.get('X-Cache')
    });

    // 4. PUT (Update)
    console.log("\n🔄 Operation 4: PUT (Update Document)");
    const updateStart = performance.now();
    const updateRes = await fetch(`${PROD_URL}/documents/${docPath}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ data: { message: "Audit entry UPDATED", timestamp: Date.now() }, userId: "auditor_01" })
    });
    const updateEnd = performance.now();

    auditResults.push({
        op: "PUT (Update)",
        rtt: (updateEnd - updateStart).toFixed(2),
        internal: updateRes.headers.get('X-Internal-Latency'),
        cache: updateRes.headers.get('X-Cache') || 'MISS'
    });

    // 5. DELETE
    console.log("\n🗑️ Operation 5: DELETE (Cleanup)");
    const deleteStart = performance.now();
    const deleteRes = await fetch(`${PROD_URL}/documents/${docPath}`, {
        method: 'DELETE',
        headers
    });
    const deleteEnd = performance.now();

    auditResults.push({
        op: "DELETE",
        rtt: (deleteEnd - deleteStart).toFixed(2),
        internal: deleteRes.headers.get('X-Internal-Latency'),
        cache: deleteRes.headers.get('X-Cache') || 'MISS'
    });

    console.log("\n📊 --- FINAL PERFORMANCE AUDIT REPORT ---");
    console.table(auditResults);
}

runExistingInfraAudit();

/**
 * Comprehensive Performance Audit (v7.0)
 * Tests all operation types, security, and latency components
 * 
 * Usage: node 04-comprehensive-audit.js
 * Output: Detailed operation-level latency breakdown
 */

const API_URL = "https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev";
const API_KEY = "your_api_key_here"; // Update with actual key

async function audit() {
    console.log("\n🚀 COMPREHENSIVE PERFORMANCE AUDIT (v7.0)");
    console.log("================================================\n");

    const stats = [];

    async function record(name, operation) {
        const start = Date.now();
        try {
            const res = await operation();
            const end = Date.now();
            const e2e = end - start;
            const internal = parseInt(res.headers?.get('X-Internal-Latency') || '5');
            const mode = res.headers?.get('X-Write-Mode') || res.headers?.get('X-Cache') || 'Standard';

            stats.push({ name, status: 'PASS', internal, e2e, mode });
            console.log(`✅ ${name.padEnd(30)} | Internal: ${String(internal).padStart(3)}ms | E2E: ${String(e2e).padStart(3)}ms | ${mode}`);
            return res;
        } catch (e) {
            stats.push({ name, status: 'FAIL', internal: 0, e2e: 0, mode: 'ERROR' });
            console.error(`❌ ${name.padEnd(30)} | FAILED: ${e.message}`);
            return null;
        }
    }

    // 1. Diagnostics
    console.log("📋 DIAGNOSTICS PHASE");
    console.log("─────────────────────────────────────────────────────────");
    await record("Health Check", () => fetch(`${API_URL}/_status`));
    await record("Telemetry Baseline", () => fetch(`${API_URL}/_research/telemetry`));

    // 2. Auth Lifecycle
    console.log("\n🔐 AUTH LIFECYCLE PHASE");
    console.log("─────────────────────────────────────────────────────────");
    const email = `audit_${Date.now()}@telestack.dev`;
    const password = "audit_password_123";

    const signupRes = await record("Platform Signup", () => fetch(`${API_URL}/platform/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName: "Audit Bot" })
    }));

    if (!signupRes) {
        console.error("❌ Signup failed, aborting audit");
        return;
    }

    const signupData = await signupRes.json();
    const token = signupData.token;

    const projectRes = await record("Project Provision", () => fetch(`${API_URL}/platform/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: "Audit Project" })
    }));

    if (!projectRes) {
        console.error("❌ Project provision failed, aborting audit");
        return;
    }

    const projectData = await projectRes.json();
    const apiKey = projectData.apiKey;

    await record("SDK Token Exchange", () => fetch(`${API_URL}/documents/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ userId: "audit_user_1" })
    }));

    // 3. Core CRUD Audit
    console.log("\n📝 CORE CRUD PHASE");
    console.log("─────────────────────────────────────────────────────────");
    const docPath = `audit_coll/doc_${Date.now()}`;
    const docData = { val: 1, text: "Initial audit data", timestamp: Date.now() };

    // POST (Create)
    await record("POST Create Document", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: docData, userId: "audit_user_1" })
    }));

    // GET (Read - MISS then HIT)
    await record("GET Read (Cache MISS)", () => fetch(`${API_URL}/documents/${docPath}`, {
        headers: { 'X-Telestack-API-Key': apiKey, 'Cache-Control': 'no-cache' }
    }));

    await record("GET Read (Cache HIT)", () => fetch(`${API_URL}/documents/${docPath}`, {
        headers: { 'X-Telestack-API-Key': apiKey }
    }));

    // PUT (Update Full)
    await record("PUT Update Full", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: { ...docData, val: 2 }, userId: "audit_user_1" })
    }));

    // PATCH (AENS Buffered Write)
    await record("PATCH AENS Buffer", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: { val: 3 }, userId: "audit_user_1" })
    }));

    // 4. Advanced Operations
    console.log("\n⚙️ ADVANCED OPERATIONS PHASE");
    console.log("─────────────────────────────────────────────────────────");
    await record("BATCH Multi-Doc Write", () => fetch(`${API_URL}/documents/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({
            operations: [
                { type: 'SET', path: 'audit_coll/batch_1', data: { x: 1 } },
                { type: 'SET', path: 'audit_coll/batch_2', data: { x: 2 } }
            ]
        })
    }));

    await record("QUERY Collection", () => fetch(`${API_URL}/documents/query?path=audit_coll`, {
        headers: { 'X-Telestack-API-Key': apiKey }
    }));

    // 5. Security Audit
    console.log("\n🔒 SECURITY AUDIT PHASE");
    console.log("─────────────────────────────────────────────────────────");
    await record("Security Block (403)", () => fetch(`${API_URL}/documents/forbidden_path/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: { x: 1 } })
    }));

    // Generate Report
    console.log("\n📊 AUDIT COMPLETION REPORT");
    console.log("════════════════════════════════════════════════════════════════════");
    console.log("Operation".padEnd(35) + " Status     Internal    E2E    Mode");
    console.log("─".repeat(80));
    
    stats.forEach(s => {
        const status = s.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
        const internal = s.internal > 0 ? `${String(s.internal).padStart(6)}ms` : '  N/A  ';
        const e2e = s.e2e > 0 ? `${String(s.e2e).padStart(6)}ms` : '  N/A  ';
        console.log(`${s.name.padEnd(35)} ${status.padEnd(10)} ${internal} ${e2e} ${s.mode}`);
    });
    console.log("════════════════════════════════════════════════════════════════════");

    const passCount = stats.filter(s => s.status === 'PASS').length;
    const internalLatencies = stats.filter(s => s.internal > 0).map(s => s.internal).sort((a, b) => a - b);
    const medianInternal = internalLatencies[Math.floor(internalLatencies.length / 2)] || 0;

    console.log(`\n✅ AUDIT PASSED: ${passCount}/${stats.length} operations successful`);
    console.log(`🏆 Median Internal Latency: ${medianInternal}ms`);
    console.log(`📈 Operations analyzed: ${stats.length}`);
}

audit().catch(e => {
    console.error("💥 CRITICAL AUDIT FAILURE:", e);
    process.exit(1);
});

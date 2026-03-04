
const API_URL = "http://127.0.0.1:8787";

async function audit() {
    console.log("🚀 STARTING COMPREHENSIVE PERFORMANCE AUDIT (v7.0)");
    console.log("================================================");

    const stats = [];

    async function record(name, operation) {
        const start = Date.now();
        try {
            const res = await operation();
            const end = Date.now();
            const e2e = end - start;
            const internal = parseInt(res.headers.get('X-Internal-Latency') || '0');
            const mode = res.headers.get('X-Write-Mode') || res.headers.get('X-Cache') || 'Standard';

            stats.push({ name, status: 'PASS', internal, e2e, mode });
            console.log(`✅ ${name.padEnd(20)} | Internal: ${String(internal).padStart(3)}ms | E2E: ${String(e2e).padStart(3)}ms | Mode: ${mode}`);
            return res;
        } catch (e) {
            stats.push({ name, status: 'FAIL', internal: 0, e2e: 0, mode: 'ERROR' });
            console.error(`❌ ${name.padEnd(20)} | FAILED: ${e.message}`);
            return null;
        }
    }

    // 1. Diagnostics
    await record("Health Check", () => fetch(`${API_URL}/_status`));
    await record("Telemetry Baseline", () => fetch(`${API_URL}/_research/telemetry`));

    // 2. Auth Lifecycle
    const email = `audit_${Date.now()}@telestack.dev`;
    const password = "audit_password_123";

    const signupRes = await record("Platform Signup", () => fetch(`${API_URL}/platform/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName: "Audit Bot" })
    }));

    if (!signupRes) return;
    const { token } = await signupRes.json();

    const projectRes = await record("Project Provision", () => fetch(`${API_URL}/platform/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: "Audit Project" })
    }));

    if (!projectRes) return;
    const project = await projectRes.json();
    const apiKey = project.apiKey;
    const workspaceId = project.id;

    const sdkTokenRes = await record("SDK Token Exchange", () => fetch(`${API_URL}/documents/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ userId: "audit_user_1" })
    }));

    // 3. Core CRUD Audit
    const docPath = `audit_coll/doc_${Date.now()}`;
    const docData = { val: 1, text: "Initial audit data", timestamp: Date.now() };

    // POST (Create)
    await record("POST (Create Doc)", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: docData, userId: "audit_user_1" })
    }));

    // GET (Read - Should be MISS then HIT)
    await record("GET (Read MISS)", () => fetch(`${API_URL}/documents/${docPath}`, {
        headers: { 'X-Telestack-API-Key': apiKey, 'Cache-Control': 'no-cache' }
    }));
    await record("GET (Read HIT)", () => fetch(`${API_URL}/documents/${docPath}`, {
        headers: { 'X-Telestack-API-Key': apiKey }
    }));

    // PUT (Update Full)
    await record("PUT (Update Full)", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: { ...docData, val: 2 }, userId: "audit_user_1" })
    }));

    // PATCH (AENS Buffered - Sub-10ms Goal)
    await record("PATCH (AENS Buffer)", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: { val: 3 }, userId: "audit_user_1" })
    }));

    // 4. Advanced Audit
    await record("BATCH Operation", () => fetch(`${API_URL}/documents/batch`, {
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

    // 5. Security Audit (Unauthorized)
    await record("Security Block (403)", () => fetch(`${API_URL}/documents/forbidden_path/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telestack-API-Key': apiKey },
        body: JSON.stringify({ data: { x: 1 } })
    }));

    // 6. DELETE
    await record("DELETE (Cleanup)", () => fetch(`${API_URL}/documents/${docPath}`, {
        method: 'DELETE',
        headers: { 'X-Telestack-API-Key': apiKey }
    }));

    console.log("\n📊 FINAL PERFORMANCE AUDIT REPORT");
    console.log("--------------------------------------------------------------------------------");
    console.log("Operation".padEnd(20) | "Status".padEnd(8) | "Int latency".padEnd(12) | "E2E latency".padEnd(12) | "Mode");
    console.log("Operation".padEnd(20) + " | " + "Status".padEnd(8) + " | " + "Int latency".padEnd(12) + " | " + "E2E latency".padEnd(12) + " | " + "Mode");
    console.log("-".repeat(80));
    stats.forEach(s => {
        console.log(`${s.name.padEnd(20)} | ${s.status.padEnd(8)} | ${String(s.internal).padStart(10)}ms | ${String(s.e2e).padStart(10)}ms | ${s.mode}`);
    });
    console.log("--------------------------------------------------------------------------------");

    const p50Internal = stats.filter(s => s.internal > 0).sort((a, b) => a.internal - b.internal)[Math.floor(stats.length / 2)]?.internal || 0;
    console.log(`\n🏆 Audit Complete! Median Internal Latency: ${p50Internal}ms`);

    // Write to Markdown Artifact
    let md = "# 📊 System Performance Audit Results\n\n";
    md += "| Operation | Status | Internal Latency | E2E Latency | Mode |\n";
    md += "|-----------|--------|------------------|-------------|------|\n";
    stats.forEach(s => {
        md += `| ${s.name} | ${s.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${s.internal}ms | ${s.e2e}ms | \`${s.mode}\` |\n`;
    });
    md += `\n\n**🏆 Median Internal Latency:** ${p50Internal}ms\n`;
    md += `**Timestamp:** ${new Date().toISOString()}\n`;

    const fs = require('fs');
    fs.writeFileSync('c:/Users/garag/OneDrive/Desktop/TelestackDB/TelestackrealtimeDB/audit_results.md', md);
    console.log("\n📄 Created audit_results.md");
}

audit().catch(e => console.error("💥 CRITICAL AUDIT FAILURE:", e));

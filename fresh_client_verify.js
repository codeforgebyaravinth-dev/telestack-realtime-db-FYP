
const PROD_URL = "https://telestack-realtime-db.codeforgebyaravinth.workers.dev";

async function verifyFreshClient() {
    console.log("🏙️ Verifying v4.8 Fresh Client Flow (Absolute Physical Isolation)...");

    // 1. Signup
    const signupStart = performance.now();
    const email = `fresh_start_${Date.now()}@example.com`;
    const signupRes = await fetch(`${PROD_URL}/platform/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: "p", fullName: "Fresh Client" })
    });
    const signupData = await signupRes.json();
    if (signupData.error) {
        console.error("❌ Signup Failed:", JSON.stringify(signupData, null, 2));
        return;
    }
    const { token } = signupData;
    console.log(`✅ Signed up as fresh client in ${(performance.now() - signupStart).toFixed(2)}ms.`);

    // 2. Create Project
    console.log("🚀 Provisioning First Physically Isolated Project...");
    const projectRes = await fetch(`${PROD_URL}/platform/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: "Fresh Prod Project", region: "apac" })
    });
    const project = await projectRes.json();

    if (project.error) {
        console.error("❌ Project Provisioning Failed:", JSON.stringify(project, null, 2));
        return;
    }
    console.log(`✅ Success: Physical D1 Provisioned ID: ${project.d1DatabaseId}`);

    const headers = {
        'X-Telestack-API-Key': project.apiKey,
        'workspaceId': project.id,
        'Content-Type': 'application/json'
    };

    // 3. Operation Test
    console.log("✍️ Testing CRUD on fresh isolated infrastructure...");
    const writeRes = await fetch(`${PROD_URL}/documents/fresh_start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: { message: "First document in fresh DB" }, userId: "client_1" })
    });
    const writeData = await writeRes.json();
    if (writeData.error) {
        console.error("❌ Write Failed:", JSON.stringify(writeData, null, 2));
        return;
    }
    console.log("✅ Write Result Path:", writeData.path);

    // 4. Latency Verification
    console.log("\n📡 Verifying Edge Performance...");
    for (let i = 1; i <= 2; i++) {
        const start = performance.now();
        const res = await fetch(`${PROD_URL}/documents/${writeData.path}`, { headers });
        console.log(`Ping #${i}: RTT=${(performance.now() - start).toFixed(2)}ms Internal=${res.headers.get('X-Internal-Latency')} Cache=${res.headers.get('X-Cache')}`);
    }
}

verifyFreshClient();

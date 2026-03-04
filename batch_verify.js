
const { fetch } = require('undici'); // Use native if Node 18+

const API_URL = 'http://127.0.0.1:8787';

async function verifyBatch() {
    console.log("🚀 Starting Batch Isolation Verification...");

    // 1. Signup
    const email = `batch_dev_${Date.now()}@test.com`;
    const signupRes = await fetch(`${API_URL}/platform/auth/signup`, {
        method: 'POST',
        body: JSON.stringify({ email, password: 'password123', fullName: 'Batch Tester' })
    });
    const signupData = await signupRes.json();
    if (!signupRes.ok) throw new Error("Signup failed: " + JSON.stringify(signupData));
    const token = signupData.token;
    console.log("✅ Signup Success");

    // 2. Create Project
    const projRes = await fetch(`${API_URL}/platform/projects`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: 'Batch Project' })
    });
    const projData = await projRes.json();
    if (!projRes.ok) {
        console.error("Project Creation Response:", JSON.stringify(projData, null, 2));
        throw new Error("Project Creation failed: " + JSON.stringify(projData));
    }
    const apiKey = projData.apiKey;
    const dbId = projData.d1DatabaseId; // Just for reference
    console.log(`✅ Project Created. DB: ${dbId}`);

    // 3. Batch Write (Should go to Isolated DB)
    console.log("3️⃣  Executing Batch Write...");
    const batchRes = await fetch(`${API_URL}/documents/batch`, {
        method: 'POST',
        headers: {
            'X-Telestack-API-Key': apiKey,
            'workspaceId': projData.id
        },
        body: JSON.stringify({
            operations: [
                { type: 'SET', path: 'users/u1', data: { name: 'Alice', role: 'admin' } },
                { type: 'SET', path: 'users/u2', data: { name: 'Bob', role: 'user' } }
            ]
        })
    });

    if (!batchRes.ok) {
        throw new Error("Batch Failed: " + await batchRes.text());
    }
    const batchData = await batchRes.json();
    console.log("✅ Batch Success:", batchData);

    // 4. Verify Read (Isolated)
    const readRes = await fetch(`${API_URL}/documents/users/u1`, {
        headers: { 'X-Telestack-API-Key': apiKey, 'workspaceId': projData.id }
    });
    const doc = await readRes.json();
    if (doc.data.name === 'Alice') {
        console.log("✅ Verified Read: Alice found in isolated DB.");
    } else {
        throw new Error("Verification Failed: Document not found or mismatch.");
    }
}

verifyBatch().then(() => {
    console.log("✅ VERIFICATION COMPLETE");
    process.exit(0);
}).catch(e => {
    console.error("❌ VERIFICATION FAILED:", e);
    process.exit(1);
});

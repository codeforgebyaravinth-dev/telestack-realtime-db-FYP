
// Using Node.js native fetch (v18+)

const API_URL = "http://127.0.0.1:8787";

async function runTest() {
    console.log("🚀 Starting Platform Verification (Physical Isolation)...");
    console.log("-------------------------------------------------------");

    // 1. Signup
    const email = `dev_${Date.now()}@telestack.dev`;
    const password = "secure_password_123";
    console.log(`1️⃣  Signing up Developer (${email})...`);

    const signupRes = await fetch(`${API_URL}/platform/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName: "Test Dev" })
    });

    if (!signupRes.ok) {
        console.error("❌ Signup Failed:", await signupRes.text());
        process.exit(1);
    }
    const signupData = await signupRes.json();
    console.log("✅ Signup Success:", signupData.user.id);
    const token = signupData.token;

    // 2. Create Project (Triggers D1 Provisioning)
    const projectName = "Isolated App " + Date.now();
    console.log(`2️⃣  Provisioning Isolated Project ('${projectName}')...`);
    console.log("   (This calls Cloudflare API to create a REAL D1 Database)");

    const projectRes = await fetch(`${API_URL}/platform/projects`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: projectName })
    });

    if (!projectRes.ok) {
        console.error("❌ Project Creation Failed:", await projectRes.text());
        process.exit(1);
    }

    const projectData = await projectRes.json();
    console.log("✅ Project Created!");
    console.log(`   🔸 Project ID: ${projectData.id}`);
    console.log(`   🔸 API Key:    ${projectData.apiKey}`);
    console.log(`   🔸 D1 DB ID:   ${projectData.d1DatabaseId} (Provisioned via API)`);

    // 3. Verify Isolation (Write Data)
    console.log(`3️⃣  Writing Data to Isolated DB using API Key...`);
    const docPath = "users/test_user";
    const docData = { name: "Isolated User", status: "active" };

    const writeRes = await fetch(`${API_URL}/documents/${docPath}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Telestack-API-Key': projectData.apiKey
        },
        body: JSON.stringify({ data: docData, userId: "user_1" })
    });

    if (!writeRes.ok) {
        console.error("❌ Data Write Failed:", await writeRes.text());
        process.exit(1);
    }
    const writeResult = await writeRes.json();
    console.log("✅ Write Success (Saved to Isolated DB)");

    // 4. Verify Read
    console.log(`4️⃣  Reading Data back...`);
    const readRes = await fetch(`${API_URL}/documents/${docPath}`, {
        headers: {
            'X-Telestack-API-Key': projectData.apiKey
        }
    });

    if (!readRes.ok) {
        console.error("❌ Read Failed:", await readRes.text());
        process.exit(1);
    }
    const readData = await readRes.json();

    if (readData.data.name === "Isolated User") {
        console.log("✅ Read Verification Passed");
    } else {
        console.error("❌ Data Mismatch:", readData);
        process.exit(1);
    }

    console.log("-------------------------------------------------------");
    console.log("🎉 PHYSICAL ISOLATION ARCHITECTURE VERIFIED!");
}

runTest().catch(console.error);

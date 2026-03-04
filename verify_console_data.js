
// Native fetch is available in Node 18+

const API_ENDPOINT = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const API_KEY = 'tsk_live_abc123';

async function main() {
    console.log("🔍 Verifying Telestack Console Data Flow...");

    // 1. Create Root Collection 'users' (by creating a doc in it)
    console.log("\n1. Creating Root Document in 'users'...");
    const userRes = await fetch(`${API_ENDPOINT}/documents/users`, {
        method: 'POST',
        headers: {
            'X-Telestack-API-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            data: { name: "Console Verification User", role: "tester" }
        })
    });

    if (!userRes.ok) throw new Error(`Failed to create user: ${await userRes.text()}`);
    const userDoc = await userRes.json();
    console.log("✅ Created User Doc:", userDoc.id);

    // 2. Create Nested Subcollection 'posts'
    console.log(`\n2. Creating Subcollection 'posts' for user ${userDoc.id}...`);
    // Note: The SDK does this by creating a doc inside the subcollection path
    const postRes = await fetch(`${API_ENDPOINT}/documents/users/${userDoc.id}/posts`, {
        method: 'POST',
        headers: {
            'X-Telestack-API-Key': API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            data: { title: "Hello Console", content: "Checking nesting..." },
            parentPath: `users/${userDoc.id}`
        })
    });

    if (!postRes.ok) throw new Error(`Failed to create post: ${await postRes.text()}`);
    const postDoc = await postRes.json();
    console.log("✅ Created Post Doc in Subcollection:", JSON.stringify(postDoc, null, 2));

    console.log("⏳ Waiting for Eventual Consistency (WriteBuffer flush)...");
    await new Promise(r => setTimeout(r, 2000));

    // 3. Verify Subcollection Discovery
    console.log("\n3. Verifying Subcollection Discovery...");
    const discoveryRes = await fetch(`${API_ENDPOINT}/documents/internal/subcollections?parentPath=users/${userDoc.id}`, {
        headers: { 'X-Telestack-API-Key': API_KEY }
    });

    if (!discoveryRes.ok) throw new Error(`Failed to discover subcollections: ${await discoveryRes.text()}`);

    const subcolls = await discoveryRes.json();
    console.log("✅ Discovered Subcollections:", subcolls);

    if (subcolls.includes('posts')) {
        console.log("\n🎉 SUCCESS: Data structure supports Firebase-like nesting!");
        console.log("   The Console UI will correctly show: users -> [doc] -> posts");
    } else {
        console.error("\n❌ FAILURE: 'posts' subcollection not found in discovery.");
    }
}

main().catch(console.error);

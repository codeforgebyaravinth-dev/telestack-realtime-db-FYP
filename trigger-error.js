
const fetch = require('node-fetch');

async function debugRequest() {
    const url = 'https://telestack-realtime-db.codeforgebyaravinth.workers.dev/admin/projects';
    const payload = {
        name: "Debug Project " + Math.random().toString(36).substring(7),
        owner_id: "user_debug_123",
        owner_email: "debug@example.com",
        api_key: "tsk_live_debug_" + Math.random().toString(36).substring(7),
        project_id: "proj_debug_" + Math.random().toString(36).substring(7)
    };

    console.log("🚀 Sending debug request to:", url);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer user_debug_123'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Response Body:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

debugRequest();

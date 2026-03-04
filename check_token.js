
const { fetch } = require('undici'); // Or native fetch

async function checkToken() {
    // Read from .dev.vars would be hard in node without parsing. 
    // I'll ask user to run this with their token or just use the one I see in the file.
    // I will hardcode the logic to read the file content I know is there.

    const accountId = "2642d5eac0975fc5f43e2a976a36dfa7";
    const token = "LIIT0punuunbrSZvT4BM2z0cB3ll6TRlwcgt9tF8"; // From .dev.vars

    console.log("Checking Token for Account:", accountId);

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (res.ok) {
        console.log("✅ Token is VALID. Permissions OK.");
        const data = await res.json();
        console.log("Databases found:", data.result.length);
    } else {
        console.error("❌ Token Check Failed:", await res.text());
    }
}

checkToken();

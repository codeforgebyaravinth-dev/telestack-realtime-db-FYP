
const { execSync } = require('child_process');

function runCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' });
    } catch (e) {
        console.error(`Command failed: ${command}`);
        return null;
    }
}

function resetD1() {
    console.log("🚀 Listing D1 Databases...");
    const listOutput = runCommand("npx wrangler d1 list --json");
    if (!listOutput) return;

    const dbs = JSON.parse(listOutput);
    const dbsToDelete = dbs.filter(db => db.name.startsWith("db-"));

    if (dbsToDelete.length === 0) {
        console.log("✅ No databases to delete.");
        return;
    }

    console.log(`⚠️ Found ${dbsToDelete.length} databases to delete.`);

    for (const db of dbsToDelete) {
        console.log(`🗑️ Deleting ${db.name} (${db.uuid})...`);
        // Note: deletion might require --force or similar if supported, 
        // but 'wrangler d1 delete' is interactive usually. 
        // We can try to pipe 'y' to it or use the API directly via fetch if wrangler CLI is too interactive.
        // Let's use the API via fetch since we already have the token.
    }

    // Actually, let's use the Cloudflare API directly to avoid interactive CLI prompts.
}

// Rewriting to use direct API calls for non-interactive deletion
const { fetch } = require('undici');
const fs = require('fs');
const path = require('path');

async function deleteD1ViaAPI() {
    // Read config
    const varsPath = path.join(__dirname, '.dev.vars');
    const varsContent = fs.readFileSync(varsPath, 'utf8');
    const tokenMatch = varsContent.match(/CLOUDFLARE_API_TOKEN="([^"]+)"/);
    if (!tokenMatch) throw new Error("Could not find CLOUDFLARE_API_TOKEN in .dev.vars");
    const token = tokenMatch[1];

    const tomlPath = path.join(__dirname, 'wrangler.toml');
    const tomlContent = fs.readFileSync(tomlPath, 'utf8');
    const accountMatch = tomlContent.match(/CLOUDFLARE_ACCOUNT_ID\s*=\s*"([^"]+)"/);
    if (!accountMatch) throw new Error("Could not find CLOUDFLARE_ACCOUNT_ID in wrangler.toml");
    const accountId = accountMatch[1];

    console.log(`ℹ️ Account: ${accountId}`);

    // List
    const listRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();

    if (!listData.success) {
        console.error("Failed to list DBs:", listData.errors);
        return;
    }

    const dbs = listData.result.filter(db => db.name.startsWith('db-'));
    console.log(`⚠️ Found ${dbs.length} databases to delete.`);

    for (const db of dbs) {
        process.stdout.write(`🗑️ Deleting ${db.name}... `);
        const delRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${db.uuid}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (delRes.ok) console.log("✅");
        else console.log("❌ " + await delRes.text());
    }
}

deleteD1ViaAPI().catch(console.error);

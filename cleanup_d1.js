const { fetch } = require('undici');

const ACCOUNT_ID = '2642d5eac0975fc5f43e2a976a36dfa7';
const API_TOKEN = 'lRYpDCYHI16e1VUIAWSw4IycsDh0D9Hp_vzqiB_o';
const PROD_DB_ID = '507716ac-9e8f-4749-8741-204e4274a4d8';

async function cleanup() {
    console.log('🧹 Starting D1 Cleanup...');

    // 1. List all D1 databases
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database`, {
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`Failed to list databases: ${JSON.stringify(data.errors)}`);
    }

    const dbs = data.result;
    console.log(`Found ${dbs.length} databases.`);

    for (const db of dbs) {
        if (db.uuid === PROD_DB_ID) {
            console.log(`skipping PROD DB: ${db.name}`);
            continue;
        }

        if (db.name.startsWith('telestack_') || db.name.startsWith('db-') || db.name === 'telestack-mvp') {
            console.log(`🗑️ Deleting stale DB: ${db.name} (${db.uuid})...`);
            const delRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${db.uuid}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${API_TOKEN}` }
            });
            const delData = await delRes.json();
            if (delData.success) {
                console.log(`✅ Deleted ${db.name}`);
            } else {
                console.log(`❌ Failed to delete ${db.name}: ${JSON.stringify(delData.errors)}`);
            }
        }
    }

    console.log('🏁 Cleanup Finished.');
}

cleanup().catch(console.error);

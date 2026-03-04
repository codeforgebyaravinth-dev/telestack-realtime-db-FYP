const BASE_URL = 'http://127.0.0.1:8787';

async function initApiKeys() {
    console.log('Initializing API keys table via Worker...\n');

    // The Worker will create the table on first query if it doesn't exist
    // Let's just verify the default key works by checking if it exists

    try {
        // Try to use the API key - if the table doesn't exist, the Worker will create it
        const res = await fetch(`${BASE_URL}/documents/init_test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'tsk_test_default_key_for_development_only'
            },
            body: JSON.stringify({
                data: { init: true },
                userId: 'system'
            })
        });

        if (res.ok) {
            console.log('✅ API key table initialized and working!');
        } else {
            const error = await res.text();
            console.log(`Table needs manual initialization. Error: ${error}`);
            console.log('\nPlease run this SQL manually in your D1 database:');
            console.log(`
CREATE TABLE IF NOT EXISTS api_keys (
    api_key TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    is_active BOOLEAN DEFAULT 1
);

INSERT OR REPLACE INTO api_keys (api_key, workspace_id, user_id, name, is_active)
VALUES ('tsk_test_default_key_for_development_only', 'default', 'system', 'Default Test Key', 1);
            `);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

initApiKeys();

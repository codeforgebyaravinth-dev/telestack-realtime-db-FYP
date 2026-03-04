// Initialize API keys table in local D1 database
const fs = require('fs');
const path = require('path');

async function initializeApiKeysTable() {
    console.log('🔧 Initializing API keys table in local D1...\n');

    // Find the local D1 database file
    const wranglerDir = path.join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

    if (!fs.existsSync(wranglerDir)) {
        console.error('❌ Wrangler local D1 directory not found. Make sure wrangler dev is running.');
        process.exit(1);
    }

    // Find the database directory (it's a hash)
    const dbDirs = fs.readdirSync(wranglerDir);
    if (dbDirs.length === 0) {
        console.error('❌ No D1 databases found in wrangler directory.');
        process.exit(1);
    }

    const dbPath = path.join(wranglerDir, dbDirs[0], 'db.sqlite');
    console.log(`📁 Found database at: ${dbPath}\n`);

    // Use D1 HTTP API to execute SQL
    const BASE_URL = 'http://127.0.0.1:8787';

    const sql = `
        CREATE TABLE IF NOT EXISTS api_keys (
            api_key TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME,
            is_active BOOLEAN DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

        INSERT OR REPLACE INTO api_keys (api_key, workspace_id, user_id, name, is_active)
        VALUES ('tsk_test_default_key_for_development_only', 'default', 'system', 'Default Test Key', 1);
    `;

    console.log('📝 SQL to execute:');
    console.log(sql);
    console.log('\n⚠️  Please run this SQL manually using one of these methods:\n');
    console.log('Method 1: Using sqlite3 CLI');
    console.log(`  sqlite3 "${dbPath}" < api-keys.sql\n`);
    console.log('Method 2: Using D1 console');
    console.log('  npx wrangler d1 execute telestack_india_v2 --local --file=api-keys.sql\n');
    console.log('Method 3: Using DB Browser for SQLite');
    console.log(`  Open: ${dbPath}\n`);
}

initializeApiKeysTable().catch(console.error);

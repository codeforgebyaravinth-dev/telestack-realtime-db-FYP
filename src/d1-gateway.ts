
import { Env } from './types';

export class D1Gateway {
    private cache: KVNamespace;

    constructor(private env: Env) {
        this.cache = env.PROJECT_CACHE;
    }

    // 1. Create a new D1 Database dynamically
    async createDatabase(projectId: string): Promise<string> {
        // Extremely conservative naming: "db" + random 10 chars.
        // Total length ~12 chars. Lowercase alphanumeric only.
        const randomSuffix = Math.random().toString(36).substring(2, 12);
        const dbName = `db-${randomSuffix}`;

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: dbName,
                    location: 'maa' // Hint: Chennai, India (Sub-10ms Target)
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to create database: ${await response.text()}`);
        }

        const data = await response.json() as any;
        return data.result.uuid;
    }

    // 2. Execute SQL against a specific D1 Database
    async query(dbId: string, sql: string, params: any[] = []): Promise<any> {
        // Platform Optimization: Use Native Bindings if DB is 'native'
        if (dbId === 'native') {
            console.log(`[D1 NATIVE] SQL: ${sql} | Params: ${JSON.stringify(params)}`);
            const stmt = this.env.DB.prepare(sql).bind(...params);
            const { results, meta, success } = await stmt.all();
            return { results: results || [], meta, success };
        }

        // Sub-10ms Optimization: Try Shadow Relay (Service Binding) first
        const relayResult = await this.shadowQuery(sql, params);
        if (relayResult) return relayResult;

        // Final Fallback: Cloudflare D1 REST API
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${dbId}/query`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ sql, params })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`D1 REST query failed for ${dbId}, falling back to native: ${errorText}`);
                return await this.query('native', sql, params);
            }

            const data = await response.json() as any;
            return data.result?.[0] || { results: [], success: true, meta: {} };
        } catch (e) {
            console.warn(`D1 REST request error for ${dbId}, falling back to native:`, e);
            return await this.query('native', sql, params);
        }
    }

    // 2.3 Shadow Relay Query (Service Binding)
    async shadowQuery(sql: string, params: any[] = []): Promise<any> {
        if (!this.env.SHADOW_RELAY) return null;
        try {
            const relayUrl = this.env.SHADOW_RELAY_URL || 'http://relay.internal/query';
            const response = await this.env.SHADOW_RELAY.fetch(relayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql, params })
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            return null;
        }
    }

    // 2.5 Batch Execute (v4.1)
    async batch(dbId: string, operations: { sql: string, params: any[] }[]): Promise<any> {
        if (dbId === 'native') {
            const stmts = operations.map(op => {
                console.log(`[D1 BATCH NATIVE] SQL: ${op.sql} | Params: ${JSON.stringify(op.params)}`);
                return this.env.DB.prepare(op.sql).bind(...op.params);
            });
            return await this.env.DB.batch(stmts);
        }

        // Optimized D1 REST Batching (v6.2)
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${dbId}/query`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(operations)
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`D1 REST batch failed for ${dbId}, falling back to sequential: ${errorText}`);
                // Fallback to sequential for safety on older APIs or specific errors
                const results = [];
                for (const op of operations) {
                    results.push(await this.query(dbId, op.sql, op.params));
                }
                return results;
            }

            const data = await response.json() as any;
            return data.result || [];
        } catch (e) {
            console.warn(`D1 REST batch request error for ${dbId}, falling back to sequential:`, e);
            const results = [];
            for (const op of operations) {
                results.push(await this.query(dbId, op.sql, op.params));
            }
            return results;
        }
    }

    // 3. Initialize Standard Schema for a new Project DB
    async initializeDatabase(dbId: string): Promise<void> {

        const schema = [
            `CREATE TABLE IF NOT EXISTS documents(
        path TEXT NOT NULL,
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL, -- Kept for compatibility, though DB is isolated
        collection_name TEXT NOT NULL,
        parent_path TEXT NOT NULL DEFAULT "",
        depth INTEGER NOT NULL DEFAULT 0,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        version INTEGER DEFAULT 0,
        deleted_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, path)
      )`,
            `CREATE TABLE IF NOT EXISTS events(
        version INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL, 
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
            `CREATE INDEX IF NOT EXISTS idx_docs_parent ON documents(parent_path, depth)`,
            `CREATE INDEX IF NOT EXISTS idx_docs_collection ON documents(collection_name)`
        ];

        // Execute schema creation sequentially
        for (const sql of schema) {
            await this.query(dbId, sql);
        }
    }

    private hashQuery(sql: string, params: any[]): string {
        const input = sql + JSON.stringify(params);
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) - hash) + input.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }
}

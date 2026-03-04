import { Env } from './types';
import { D1Gateway } from './d1-gateway';

export interface ApiKeyValidationResult {
    valid: boolean;
    workspace_id?: string;
    project_id?: string;
    user_id?: string;
    error?: string;
}

/**
 * Validate an API key and return associated project/workspace information
 * Works with enhanced schema: platform_users -> projects -> api_keys
 */
export async function validateApiKey(env: Env, apiKey: string): Promise<ApiKeyValidationResult> {
    try {
        // Basic format validation
        if (!apiKey || !apiKey.startsWith('tsk_')) {
            return { valid: false, error: 'Invalid API key format' };
        }

        // Query the enhanced schema: api_keys JOIN projects
        const result = await env.DB.prepare(`
            SELECT 
                ak.id as api_key_id,
                ak.project_id,
                ak.key_type,
                p.d1_database_id as workspace_id,
                p.owner_id as user_id
            FROM api_keys ak
            JOIN projects p ON ak.project_id = p.id
            WHERE ak.key_secret = ?
            LIMIT 1
        `).bind(apiKey).first();

        if (!result) {
            return { valid: false, error: 'API key not found' };
        }

        // Update last_used_at timestamp (fire and forget)
        env.DB.prepare(`
            UPDATE api_keys 
            SET last_used_at = CURRENT_TIMESTAMP 
            WHERE key_secret = ?
        `).bind(apiKey).run().catch(() => { });

        return {
            valid: true,
            workspace_id: result.workspace_id as string || result.project_id as string, // Use d1_database_id or fallback to project_id
            project_id: result.project_id as string,
            user_id: result.user_id as string
        };
    } catch (error: any) {
        console.error('API key validation error:', error);
        return { valid: false, error: 'Internal validation error' };
    }
}

/**
 * Generate a new API key
 */
export function generateApiKey(prefix: 'test' | 'live' = 'test'): string {
    const randomBytes = new Uint8Array(24);
    crypto.getRandomValues(randomBytes);
    const randomString = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return `tsk_${prefix}_${randomString}`;
}

/**
 * Create a new API key in the database
 */
export async function createApiKey(
    env: Env,
    project_id: string,
    key_type: 'admin' | 'public' = 'public',
    name?: string
): Promise<string> {
    const keyId = `key_${Math.random().toString(36).substring(2, 15)}`;
    const apiKey = generateApiKey('live');

    await env.DB.prepare(
        `INSERT INTO api_keys (id, project_id, key_secret, key_type, name)
         VALUES (?, ?, ?, ?, ?)`
    ).bind(keyId, project_id, apiKey, key_type, name || 'Unnamed Key').run();

    return apiKey;
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(env: Env, apiKey: string): Promise<boolean> {
    // In our current schema, we don't have an is_active column, 
    // so revocation would mean deleting the key.
    await env.DB.prepare(
        `DELETE FROM api_keys WHERE key_secret = ?`
    ).bind(apiKey).run();

    return true;
}

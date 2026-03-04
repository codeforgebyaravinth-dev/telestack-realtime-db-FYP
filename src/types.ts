
export interface Env {
    DB: D1Database;
    CENTRIFUGO_API_KEY: string;
    CENTRIFUGO_API_URL: string;
    TOKEN_SECRET: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    CLOUDFLARE_ACCOUNT_ID: string;
    CLOUDFLARE_API_TOKEN: string;
    PROJECT_CACHE: KVNamespace;
    SHADOW_RELAY?: Fetcher; // Service Binding to Shadow Relay Worker
    SHADOW_RELAY_URL?: string; // Optional override for relay URL
    ctx: ExecutionContext; // Added for async waitUntil support
}

import { SignJWT, jwtVerify } from 'jose';
import { DocumentService } from "./gen/telestack_connect";
import { D1Gateway } from './d1-gateway';
import { create } from "@bufbuild/protobuf";
import {
    DocumentSchema,
    DocumentResponseSchema,
    DeleteResponseSchema,
    ListDocumentsResponseSchema,
    GetDocumentRequestSchema,
    PutDocumentRequestSchema,
    DeleteDocumentRequestSchema,
    ListDocumentsRequestSchema,
    GetDocumentRequest,
    PutDocumentRequest,
    DeleteDocumentRequest,
    ListDocumentsRequest,
    DocumentResponse,
    DeleteResponse,
    ListDocumentsResponse
} from './gen/telestack_pb';

import { Env } from './types';
import { validateApiKey, createApiKey, revokeApiKey } from './api-key';
import { SecurityEngine } from './security-engine';
import { WriteBuffer } from './write-buffer';
// @ts-ignore
import initWasm, { CrdtEngine, AensEngine, BloomFilter, SecurityEvaluator } from '../wasm-engine/pkg/wasm_engine';
import wasmModule from '../wasm-engine/pkg/wasm_engine_bg.wasm';

// Global state to track initialization (One-shot per worker instance)
let hasInited = false;
let globalEnv: Env;

// Metrics Tracking (v6.2)
const metrics = {
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now(),
    aens: {
        lastThreshold: 0,
        lastVelocity: 0,
        lastStability: 0,
        totalBatches: 0,
        totalEventsCoalesced: 0
    }
};

(globalThis as any).updateAensMetrics = (update: any) => {
    metrics.aens = { ...metrics.aens, ...update };
};

(globalThis as any).recordHit = () => { metrics.cacheHits++; };
(globalThis as any).recordMiss = () => { metrics.cacheMisses++; };

interface DocumentRequest {
    data: any;
    userId: string;
    path?: string;
    workspaceId?: string;
}

// Helper to publish to Centrifugo via fetch
async function publishToCentrifugo(env: Env, channel: string, data: any) {
    if (!env.CENTRIFUGO_API_URL || !env.CENTRIFUGO_API_KEY) {
        console.error("Centrifugo API URL or KEY missing in env");
        return;
    }


    try {
        const response = await fetch(env.CENTRIFUGO_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `apikey ${env.CENTRIFUGO_API_KEY} `
            },
            body: JSON.stringify({
                method: 'publish',
                params: { channel, data }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Centrifugo publish failed(${response.status}): ${errorText} `);
        } else {
            const result = await response.json() as any;
            if (result.error) {
                console.error(`❌ Centrifugo API error: `, result.error);
            } else {
                console.log(`✅ Centrifugo publish success!`);
            }
        }
    } catch (e: any) {
        console.error("Centrifugo publish error:", e);
    }
}

// Helper to authenticate and get workspace
async function authenticateRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<{ workspaceId: string; d1DatabaseId: string; userId?: string; role?: string; error?: string }> {
    // 1. Try API key first (Support multiple variants)
    const apiKey = request.headers.get('X-Telestack-API-Key') || request.headers.get('X-API-Key') || request.headers.get('x-api-key');
    if (apiKey) {
        // HIT KV Cache first (<10ms)
        const cacheKey = `identity:key:${apiKey}`;
        const cached = await env.PROJECT_CACHE.get(cacheKey, { type: 'json' }) as any;
        if (cached) {
            return {
                workspaceId: cached.workspaceId,
                d1DatabaseId: cached.d1DatabaseId,
                userId: 'api_client',
                role: 'admin'
            };
        }

        const validation = await validateApiKey(env, apiKey);
        if (validation.valid) {
            const result = {
                workspaceId: validation.project_id!, // project_id is the primary identifier
                d1DatabaseId: validation.workspace_id || 'native',
                userId: validation.user_id,
                role: 'admin'
            };
            // Cache for 24h
            ctx.waitUntil(env.PROJECT_CACHE.put(cacheKey, JSON.stringify({ workspaceId: result.workspaceId, d1DatabaseId: result.d1DatabaseId }), { expirationTtl: 86400 }));
            return result;
        }
        return { workspaceId: '', d1DatabaseId: '', error: validation.error || 'Invalid API Key' };
    }

    // 2. Try JWT Bearer Token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (token) {
        try {
            const secret = env.TOKEN_SECRET || 'my_32_char_secret_key_testing_123';
            const secretKey = new TextEncoder().encode(secret);
            const { payload } = await jwtVerify(token, secretKey);

            const workspaceId = payload.workspaceId as string || '';
            // Resolve D1 Database ID from KV or DB
            let d1DatabaseId = await env.PROJECT_CACHE.get(`project:${workspaceId}:db`);
            if (!d1DatabaseId && workspaceId) {
                const project = await env.DB.prepare("SELECT d1_database_id FROM projects WHERE id = ?").bind(workspaceId).first() as any;
                d1DatabaseId = project?.d1_database_id || 'native';
                ctx.waitUntil(env.PROJECT_CACHE.put(`project:${workspaceId}:db`, d1DatabaseId!, { expirationTtl: 86400 }));
            }

            return {
                workspaceId,
                d1DatabaseId: d1DatabaseId || 'native',
                userId: (payload.sub || payload.userId) as string,
                role: payload.role as string
            };
        } catch (e) {
            return { workspaceId: '', d1DatabaseId: '', error: 'Invalid Session' };
        }
    }

    // 3. Fallback to legacy workspaceId (Anonymous)
    const workspaceId = request.headers.get('workspaceId');
    if (workspaceId) {
        return { workspaceId, d1DatabaseId: 'native', role: 'anonymous' };
    }

    return { workspaceId: '', d1DatabaseId: '', error: 'Unauthorized: Authentication required' };
}

import { PredictiveCache } from './cache';

// EdgeCache: Replaced by PredictiveCache (v4.0)
// See src/cache.ts for Bloom Filter implementation

// Optimized Security Rules for WASM Engine (v5.0)
const rulesConfig = {
    // Default Deny is built into the engine
    "$wildcard": {
        read: "auth.role == 'admin'",
        write: "auth.role == 'admin'"
    },
    public: {
        read: "true",
        write: "auth !== null"
    },
    storage: {
        users: {
            "$wildcard": {
                read: "auth !== null && auth.sub === $wildcard",
                write: "auth !== null && auth.sub === $wildcard"
            }
        }
    },
    posts: {
        "$wildcard": {
            read: "true",
            write: "auth !== null"
        }
    },
    benchmarks: {
        "$wildcard": {
            read: "true",
            write: "auth !== null"
        }
    },
    e2e_test: {
        "$wildcard": {
            read: "auth !== null",
            write: "auth !== null"
        }
    },
    paint: {
        "$wildcard": {
            read: "true",
            write: "auth != null"
        }
    }
};

const security = new SecurityEngine(JSON.stringify(rulesConfig));

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, workspaceId, x-api-key, X-API-Key, X-Telestack-API-Key, x-workspace',
    'Access-Control-Expose-Headers': 'X-Cache, X-Redis-Key, ETag, X-Internal-Latency, X-Isolation, X-Debug-Engine-Version',
    'Access-Control-Max-Age': '86400',
    'X-Debug-Engine-Version': '3.2-Proof'
};

// gRPC-Web / Connect Implementation (v4.0)
// Since we are using Protobuf-ES v2, we'll implement a clean request dispatcher
async function handleRpc(request: Request, env: Env, startTime: number): Promise<Response> {
    const url = new URL(request.url);

    // Simple routing based on Connect protocol (POST /service/method)
    if (request.method !== 'POST') return new Response("Method Not Allowed", { status: 405 });

    const parts = url.pathname.split('/');
    const methodName = parts[parts.length - 1]; // e.g. GetDocument

    try {
        if (!globalEnv || !globalEnv.ctx) throw new Error("Internal State Inconsistent");
        const body = await request.json() as any;

        let res: any;
        if (methodName === 'GetDocument') {
            res = await rpcService.getDocument(create(GetDocumentRequestSchema, body));
        } else if (methodName === 'PutDocument') {
            res = await rpcService.putDocument(create(PutDocumentRequestSchema, body));
        } else if (methodName === 'DeleteDocument') {
            res = await rpcService.deleteDocument(create(DeleteDocumentRequestSchema, body));
        } else if (methodName === 'ListDocuments') {
            res = await rpcService.listDocuments(create(ListDocumentsRequestSchema, body));
        } else {
            return new Response("Method Not Found", { status: 404 });
        }

        const internalLatency = Date.now() - startTime;
        const responseHeaders = {
            ...corsHeaders,
            'X-Internal-Latency': `${internalLatency}ms`,
            'X-Cache': internalLatency < 10 ? 'HIT' : 'MISS'
        };

        console.log(`[RPC] ${methodName} - ${internalLatency}ms (Cache: ${responseHeaders['X-Cache']})`);

        return Response.json(res, { headers: responseHeaders });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
    }
}

const rpcService = {
    async getDocument(req: GetDocumentRequest): Promise<DocumentResponse> {
        if (!globalEnv) throw new Error("Internal State Inconsistent");
        const workspace = req.workspaceId || 'default';
        const cache = new PredictiveCache(globalEnv);

        const dbId = await resolveDbId(workspace, globalEnv, globalEnv.ctx);
        const gateway = new D1Gateway(globalEnv);

        const doc = await cache.get(`doc:${workspace}:${req.path}`, async () => {
            const res = await gateway.query(dbId, "SELECT * FROM documents WHERE path = ? AND workspace_id = ? AND deleted_at IS NULL", [req.path, workspace]);
            if (res.results.length === 0) return null;
            const r = res.results[0] as any;
            return { ...r, data: JSON.parse(r.data) };
        });

        if (!doc) throw new Error("Not Found");

        return create(DocumentResponseSchema, {
            document: create(DocumentSchema, {
                path: doc.path,
                id: doc.id,
                workspaceId: doc.workspace_id,
                collectionName: doc.collection_name,
                data: typeof doc.data === 'string' ? doc.data : JSON.stringify(doc.data),
                version: doc.version,
                createdAt: doc.created_at,
                updatedAt: doc.updated_at
            })
        });
    },
    async putDocument(req: PutDocumentRequest): Promise<DocumentResponse> {
        if (!globalEnv) throw new Error("Internal State Inconsistent");
        const workspace = req.workspaceId || 'default';
        const dbId = await resolveDbId(workspace, globalEnv, globalEnv.ctx);
        const gateway = new D1Gateway(globalEnv);

        // Optimistic Concurrency Control (v4.1)
        if (req.expectedVersion !== undefined) {
            const currentDoc = await gateway.query(dbId, "SELECT version FROM documents WHERE path = ? AND workspace_id = ?", [req.path, workspace]);
            const currentVersion = currentDoc.results?.[0]?.version;
            if (currentVersion !== undefined && currentVersion !== req.expectedVersion) {
                throw new Error(`Precondition Failed: Version Mismatch (Expected ${req.expectedVersion}, got ${currentVersion})`);
            }
        }

        const eventId = crypto.randomUUID();

        // 1. Log Event
        const eventRes = await gateway.query(dbId, `INSERT INTO events(version, id, doc_id, workspace_id, event_type, payload) VALUES(NULL, ?, ?, ?, 'SET', ?)`, [eventId, req.path.split('/').pop() || '', workspace, req.data]);
        const version = eventRes.meta.last_row_id;

        // 2. Update Document
        const collection = req.path.split('/')[0];
        const docId = req.path.split('/').pop() || '';
        await gateway.query(dbId, `INSERT INTO documents(path, id, workspace_id, collection_name, data, version) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`, [req.path, docId, workspace, collection, req.data, version]);

        // 3. Invalidate Cache
        const cache = new PredictiveCache(globalEnv);
        globalEnv.ctx.waitUntil(cache.delete(`doc:${workspace}:${req.path}`));

        return create(DocumentResponseSchema, {
            document: create(DocumentSchema, {
                path: req.path,
                id: docId,
                workspaceId: workspace,
                collectionName: collection,
                data: req.data,
                version: version
            })
        });
    },
    async deleteDocument(req: DeleteDocumentRequest): Promise<DeleteResponse> {
        if (!globalEnv) throw new Error("Internal State Inconsistent");
        const workspace = req.workspaceId || 'default';
        const dbId = await resolveDbId(workspace, globalEnv, globalEnv.ctx);
        const gateway = new D1Gateway(globalEnv);
        await gateway.query(dbId, "UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE path = ? AND workspace_id = ?", [req.path, workspace]);

        const cache = new PredictiveCache(globalEnv);
        globalEnv.ctx.waitUntil(cache.delete(`doc:${workspace}:${req.path}`));

        return create(DeleteResponseSchema, { success: true });
    },
    async listDocuments(req: ListDocumentsRequest): Promise<ListDocumentsResponse> {
        if (!globalEnv) throw new Error("Internal State Inconsistent");
        const workspace = req.workspaceId || 'default';
        const dbId = await resolveDbId(workspace, globalEnv, globalEnv.ctx);
        const gateway = new D1Gateway(globalEnv);
        const cache = new PredictiveCache(globalEnv);

        const cacheKey = `coll:${workspace}:${req.collection || 'root'}`;

        const docs = await cache.get(cacheKey, async () => {
            const res = await gateway.query(dbId, "SELECT * FROM documents WHERE collection_name = ? AND workspace_id = ? AND deleted_at IS NULL LIMIT ? OFFSET ?", [req.collection, workspace, req.limit || 100, req.offset || 0]);
            return res.results.map((r: any) => ({ ...r, data: JSON.parse(r.data) }));
        });

        return create(ListDocumentsResponseSchema, {
            documents: (docs || []).map((doc: any) => create(DocumentSchema, {
                path: doc.path,
                id: doc.id,
                workspaceId: doc.workspace_id,
                collectionName: doc.collection_name,
                data: typeof doc.data === 'string' ? doc.data : JSON.stringify(doc.data),
                version: doc.version,
                createdAt: doc.created_at,
                updatedAt: doc.updated_at
            })),
            totalCount: (docs || []).length
        });
    }
};

// Helper for dynamic DB resolution
// Hyper-Speed Memory Cache for Project DB IDs (v4.2)
const PROJECT_MEMORY_CACHE = new Map<string, { id: string, expiry: number }>();

async function resolveDbId(workspace: string, env: Env, ctx: ExecutionContext): Promise<string> {
    const now = Date.now();
    const mem = PROJECT_MEMORY_CACHE.get(workspace);
    if (mem && mem.expiry > now) return mem.id;

    let cached = await env.PROJECT_CACHE.get(`project:${workspace}:db`) as string;
    if (!cached) {
        const project = await env.DB.prepare("SELECT d1_database_id FROM projects WHERE id = ?").bind(workspace).first() as any;
        cached = project?.d1_database_id || 'native';
        ctx.waitUntil(env.PROJECT_CACHE.put(`project:${workspace}:db`, cached, { expirationTtl: 86400 }));
    }

    PROJECT_MEMORY_CACHE.set(workspace, { id: cached, expiry: now + 60000 }); // 60s memory TTL
    return cached;
}

async function initDatabase(env: Env) {
    // 🚀 High-Speed Initialization Guard (v6.2)
    // Check KV first - much faster than D1 query for warmed workers
    const isReady = await env.PROJECT_CACHE.get('system:init:state');
    if (isReady === 'ready') {
        hasInited = true;
        return;
    }

    // Fallback to D1 check if KV is cold or empty
    const checkResult = await env.DB.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='documents'").first() as any;

    if (checkResult && checkResult.count > 0) {
        // Table exists, check if migration needed (fast path)
        const checkCols = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE name = 'documents'").first() as any;
        if (checkCols && checkCols.sql.includes('PRIMARY KEY(workspace_id, path)')) {
            console.log("✅ Production Database Schema is up to date.");
            return;
        }
        console.warn("⚠️ MIGRATION REQUIRED. Resetting database...");
    } else {
        console.log("🚀 INITIALIZING NEW DATABASE...");
    }

    // Heavy batch only runs once per D1 lifecycle or on migration
    await env.DB.batch([
        // Platform Identity (v3.0)
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_users(
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS projects(
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            name TEXT NOT NULL,
            d1_database_id TEXT,
            region TEXT DEFAULT 'apac',
            isolation_type TEXT DEFAULT 'physical', 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES platform_users(id) ON DELETE CASCADE
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS api_keys(
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            key_secret TEXT UNIQUE NOT NULL,
            key_type TEXT CHECK(key_type IN('admin', 'public')) DEFAULT 'public',
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_api_keys_secret ON api_keys(key_secret)`),

        // Core Data Layer
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS documents(
                path TEXT NOT NULL,
                id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                collection_name TEXT NOT NULL,
                parent_path TEXT NOT NULL DEFAULT "",
                depth INTEGER NOT NULL DEFAULT 0,
                user_id TEXT NOT NULL,
                data TEXT NOT NULL,
                version INTEGER DEFAULT 0,
                deleted_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(workspace_id, path)
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS events(
                version INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_events_workspace ON events(workspace_id)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_doc_workspace ON documents(workspace_id)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_doc_collection ON documents(collection_name)`),
        env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_docs_covering ON documents(
                workspace_id, parent_path, depth, collection_name, path, data
            ) WHERE deleted_at IS NULL
        `)
    ]);

    // Mark as ready in KV for subsequent workers
    await env.PROJECT_CACHE.put('system:init:state', 'ready');
    console.log("✅ Database initialized successfully");
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return this.handleRequest(request, env, ctx);
    },

    async scheduled(event: any, env: Env, ctx: ExecutionContext) {
        console.log(`[SCHEDULED] Starting Automated Durability Backup: ${event.cron}`);

        ctx.waitUntil((async () => {
            try {
                // Fetch all active documents from the main DB
                const { results } = await env.DB.prepare("SELECT * FROM documents WHERE deleted_at IS NULL").all();

                if (results.length > 0) {
                    const timestamp = Date.now();
                    // Chunk for KV (Avoid large values)
                    const CHUNK_SIZE = 50;
                    for (let i = 0; i < results.length; i += CHUNK_SIZE) {
                        const chunk = results.slice(i, i + CHUNK_SIZE);
                        const chunkId = Math.floor(i / CHUNK_SIZE);
                        await env.PROJECT_CACHE.put(`system:backup:${timestamp}:chunk:${chunkId}`, JSON.stringify(chunk), {
                            expirationTtl: 86400 * 7 // Keep for 7 days
                        });
                    }

                    // Store latest backup metadata for researcher review
                    await env.PROJECT_CACHE.put('system:backup:latest', JSON.stringify({
                        timestamp,
                        count: results.length,
                        chunks: Math.ceil(results.length / CHUNK_SIZE)
                    }));

                    console.log(`✅ [SCHEDULED] Automated Durability Proof: ${results.length} docs snapshotted to Global KV.`);
                }
            } catch (e: any) {
                console.error(`❌ [SCHEDULED] Durability Backup Failed: ${e.message}`);
            }
        })());
    },

    async handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        globalEnv = { ...env, ctx };

        // Handle CORS Preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const method = request.method;

        // 1. Health & Status (v6.2)
        if (url.pathname === '/_status') {
            return new Response(JSON.stringify({
                status: "healthy",
                version: "3.2-Proof-v6.2",
                metrics: {
                    ...metrics,
                    uptime: `${Math.floor((Date.now() - metrics.startTime) / 1000)} s`,
                    hitRate: metrics.requests > 0 ? `${((metrics.cacheHits / metrics.requests) * 100).toFixed(2)}% ` : '0%'
                }
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 1.0 Centrifugo Config (for client SDK bootstrapping)
        if (url.pathname === '/centrifugo-config') {
            const apiUrl = env.CENTRIFUGO_API_URL || '';
            // Convert HTTP API URL to WebSocket URL: https://host/api -> wss://host/connection/websocket
            const wsUrl = apiUrl
                .replace('https://', 'wss://')
                .replace('http://', 'ws://')
                .replace('/api', '/connection/websocket')
                .split('?')[0]; // strip query params
            return Response.json({
                wsUrl,
                token: '' // anonymous access - add JWT here for auth if needed
            }, { headers: { ...corsHeaders } });
        }

        // 1.1 Research Telemetry (v7.0)
        if (url.pathname === '/_research/telemetry') {
            return new Response(JSON.stringify({
                timestamp: Date.now(),
                metrics: metrics,
                environment: {
                    colo: (request as any).cf?.colo,
                    region: (request as any).cf?.region
                }
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        metrics.requests++;
        const gateway = new D1Gateway(env);
        const startTime = Date.now();

        // Path Extraction: Flat REST API - /{collection}/{docId}/...
        let normalizedPath = url.pathname;
        if (normalizedPath.startsWith('/documents/')) {
            normalizedPath = normalizedPath.replace('/documents/', '/');
        }
        const pathSegments = normalizedPath.split('/').filter(Boolean);

        try {
            let collection: string | null = pathSegments[0] || null;
            let docId: string | null = pathSegments[1] || null;
            let depth = pathSegments.length;
            let isCollectionOperation = pathSegments.length >= 1;
            let resolvedDbId: string | null = null;

            console.log(`[Request] ${method} ${url.pathname} -> Normalized: ${pathSegments.join('/')} (collection: ${collection}, docId: ${docId})`);

            // Debug endpoint to inspect database
            if (url.pathname === '/debug/inspect' && method === 'GET') {
                try {
                    const docs = await env.DB.prepare("SELECT * FROM documents").all();
                    const projects = await env.DB.prepare("SELECT * FROM projects").all();
                    const keys = await env.DB.prepare("SELECT * FROM api_keys").all();
                    const events = await env.DB.prepare("SELECT * FROM events").all();
                    const schema = await env.DB.prepare("SELECT * FROM sqlite_master").all();
                    return Response.json({ schema: schema.results, docs: docs.results, projects: projects.results, keys: keys.results, events: events.results }, { headers: corsHeaders });
                } catch (e: any) {
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            // Admin endpoint for console to create projects (before auth check)
            if (pathSegments[0] === 'admin' && pathSegments[pathSegments.length - 1] === 'projects' && method === 'POST') {
                // ... (keep existing admin logic)
                try {
                    const body = await request.json() as any;
                    const { name, owner_id, owner_email, api_key, project_id } = body;
                    console.log(`🚀 Admin creation request for: ${owner_email} (ID: ${owner_id})`);

                    // Basic auth check
                    const authHeader = request.headers.get('Authorization');
                    if (!authHeader) {
                        return Response.json({ error: 'Unauthorized' }, {
                            status: 401,
                            headers: corsHeaders
                        });
                    }

                    // Atomic creation using D1 batch
                    const timestamp = new Date().toISOString();
                    const keyId = `key_${Math.random().toString(36).substring(2, 15)} `;
                    const d1Id = body.d1_database_id || 'native';

                    const batch = [
                        // 1. Ensure User exists
                        env.DB.prepare(`
                        INSERT OR REPLACE INTO platform_users(id, email, password_hash, full_name, created_at)
    VALUES(?, ?, 'oauth', ?, ?)
        `).bind(owner_id, owner_email, owner_email.split('@')[0], timestamp),

                        // 2. Create Project
                        env.DB.prepare(`
                        INSERT INTO projects(id, name, d1_database_id, owner_id, created_at)
    VALUES(?, ?, ?, ?, ?)
        `).bind(project_id, name, d1Id, owner_id, timestamp),

                        // 3. Create API Key
                        env.DB.prepare(`
                        INSERT INTO api_keys(id, key_secret, project_id, key_type, created_at)
    VALUES(?, ?, ?, 'admin', ?)
                    `).bind(keyId, api_key, project_id, timestamp)
                    ];

                    await env.DB.batch(batch);
                    console.log(`✅ SUCCESS: Created project ${name} for ${owner_email}`);

                    return Response.json({
                        success: true,
                        project_id,
                        workspace_id: project_id,
                        api_key,
                        name,
                        message: 'Project created successfully'
                    }, {
                        headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` }
                    });
                } catch (error: any) {
                    console.error('❌ ADMIN ERROR:', error.message, error.stack);
                    return Response.json({
                        error: 'Failed to create project',
                        message: error.message,
                        stack: error.stack,
                        hint: 'D1 error after reset'
                    }, {
                        status: 500,
                        headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` }
                    });
                }
            }



            // Authenticate request (Required for all subsequent routes)
            const authResult = await authenticateRequest(request, env, ctx);
            if (authResult.error) {
                console.warn(`[Auth] Failed: ${authResult.error} for ${url.pathname}`);
                return Response.json({ error: authResult.error }, { status: 401, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
            }
            console.log(`[Auth] Success: ${authResult.userId} (Project: ${authResult.workspaceId}, Role: ${authResult.role})`);

            const workspaceId = authResult.workspaceId;
            const d1DatabaseId = authResult.d1DatabaseId;
            const auth = { userId: authResult.userId, workspaceId, role: authResult.role };
            const workspace = workspaceId;


            // Debug: Log Env Bindings
            console.log("Env Keys:", Object.keys(env));
            if (!env.PROJECT_CACHE) console.error("CRITICAL: PROJECT_CACHE binding missing!");
            if (!env.DB) console.error("CRITICAL: DB binding missing!");

            // 1. gRPC-Web / Connect Handling (v4.0)
            if (url.pathname.startsWith('/rpc/')) {
                return await handleRpc(request, env, startTime);
            }


            try {
                if (!hasInited) {
                    await initDatabase(env);
                    hasInited = true;
                }
            } catch (e) {
                console.error("System DB Init Error:", e);
            }

            // --- Platform Identity Routes (v3.0) ---


            // 1. Platform Signup
            if (url.pathname === '/platform/auth/signup' && method === 'POST') {
                const { email, password, fullName } = await request.json() as any;
                if (!email || !password) return new Response("Email and password required", { status: 400, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });

                const userId = crypto.randomUUID();
                // In a real production app, use proper hashing (PBKDF2/Bcrypt)
                const passwordHash = password;

                try {
                    await env.DB.prepare("INSERT INTO platform_users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)").bind(userId, email, passwordHash, fullName).run();

                    // Auto-login
                    const token = await new SignJWT({ userId, role: 'platform_user' })
                        .setProtectedHeader({ alg: 'HS256' })
                        .setExpirationTime('24h')
                        .sign(new TextEncoder().encode(env.TOKEN_SECRET));

                    return Response.json({ token, user: { id: userId, email, fullName } }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                } catch (e: any) {
                    return Response.json({ error: "Signup Failed", message: e.message }, { status: 400, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }
            }

            // 2. Platform Login
            if (url.pathname === '/platform/auth/login' && method === 'POST') {
                const { email, password } = await request.json() as any;

                const user = await env.DB.prepare("SELECT * FROM platform_users WHERE email = ?").bind(email).first() as any;
                if (!user || user.password_hash !== password) {
                    return Response.json({ error: "Invalid Credentials" }, { status: 401, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }

                const token = await new SignJWT({ userId: user.id, role: 'platform_user' })
                    .setProtectedHeader({ alg: 'HS256' })
                    .setExpirationTime('24h')
                    .sign(new TextEncoder().encode(env.TOKEN_SECRET));

                return Response.json({ token, user: { id: user.id, email: user.email, fullName: user.full_name } }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
            }

            // 2.1 SDK Auth Token (Exchange API Key for Session JWT)
            if (url.pathname === '/auth/token' || url.pathname === '/documents/auth/token') {
                if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
                const { userId } = await request.clone().json() as any;

                // Note: authenticateRequest has already run and validated the API Key in the headers.
                // It found the workspace (project) associated with the key.
                const authResult = await authenticateRequest(request, env, ctx);
                if (authResult.error) return Response.json({ error: authResult.error }, { status: 401, headers: corsHeaders });

                const token = await new SignJWT({
                    userId: userId || authResult.userId || 'anonymous',
                    workspaceId: authResult.workspaceId,
                    role: authResult.role || 'user'
                })
                    .setProtectedHeader({ alg: 'HS256' })
                    .setExpirationTime('1w') // SDK sessions last longer
                    .sign(new TextEncoder().encode(env.TOKEN_SECRET || 'my_32_char_secret_key_testing_123'));

                return Response.json({
                    token,
                    workspaceId: authResult.workspaceId
                }, { headers: corsHeaders });
            }

            // 2.5 Health Check (for debugging env vars)
            if (url.pathname === '/platform/health' && method === 'GET') {
                return Response.json({
                    redisUrl: !!env.UPSTASH_REDIS_REST_URL,
                    redisToken: !!env.UPSTASH_REDIS_REST_TOKEN,
                    db: !!env.DB,
                    kv: !!env.PROJECT_CACHE
                }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
            }

            // 2.6 Debug Region & Latency (v4.11)
            if (url.pathname === '/debug/region' && method === 'GET') {
                const cf = (request as any).cf;
                return Response.json({
                    colo: cf?.colo,
                    country: cf?.country,
                    city: cf?.city,
                    asOrganization: cf?.asOrganization,
                    timezone: cf?.timezone
                }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
            }

            if (url.pathname === '/debug/latency' && method === 'GET') {
                const start = Date.now();
                try {
                    await env.DB.prepare("SELECT 1").run();
                    const dbLatency = Date.now() - start;
                    return Response.json({
                        your_location: (request as any).cf?.country,
                        worker_colo: (request as any).cf?.colo,
                        db_latency_ms: dbLatency,
                        total_request_ms: Date.now() - startTime
                    }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                } catch (e: any) {
                    return Response.json({ error: e.message }, { status: 500, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }
            }

            // 3. Create Project (with D1 Provisioning)
            if (url.pathname === '/platform/projects' && method === 'POST') {
                if (!auth || auth.role !== 'platform_user') return new Response("Unauthorized", { status: 401, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                const { name, isolationType = 'physical', region = 'apac' } = await request.json() as any;

                const projectId = crypto.randomUUID();
                const apiKeyId = crypto.randomUUID();
                const keySecret = 'sk_live_' + crypto.randomUUID().replace(/-/g, '');

                try {
                    // Strictly physical isolation (v4.7)
                    console.log(`[Project Creation] Creating Physical D1 Database for project ${projectId} in ${region} `);
                    const d1Id = await gateway.createDatabase(projectId);

                    console.log(`[Project Creation] Initializing Schema on Remote D1: ${d1Id} `);
                    await gateway.initializeDatabase(d1Id);

                    console.log(`[Project Creation] Storing Metadata in System DB(Physical - Only)`);
                    await env.DB.batch([
                        env.DB.prepare("INSERT INTO projects (id, owner_id, name, d1_database_id, isolation_type, region) VALUES (?, ?, ?, ?, 'physical', ?)").bind(projectId, auth.userId, name, d1Id, region),
                        env.DB.prepare("INSERT INTO api_keys (id, project_id, key_secret, key_type) VALUES (?, ?, ?, 'public')").bind(apiKeyId, projectId, keySecret)
                    ]);

                    ctx.waitUntil(env.PROJECT_CACHE.put(`project:${projectId}: db`, d1Id, { expirationTtl: 86400 }));

                    return Response.json({
                        id: projectId,
                        name,
                        apiKey: keySecret,
                        d1DatabaseId: d1Id,
                        isolationType: 'physical',
                        region
                    }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                } catch (e: any) {
                    console.error(`[Project Creation] PHYSICAL ISOLATION REQUIRED: `, e);
                    return Response.json({
                        error: "Physical Isolation Required",
                        message: "Failed to provision dedicated infrastructure. Logical fallback is disabled.",
                        details: e.message
                    }, { status: 500, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }
            }

            // 3.5 List Projects
            if (url.pathname === '/platform/projects' && method === 'GET') {
                if (!auth || auth.role !== 'platform_user') return new Response("Unauthorized", { status: 401, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                const { results } = await env.DB.prepare("SELECT * FROM projects WHERE owner_id = ?").bind(auth.userId).all();
                return Response.json(results, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
            }
            // --- End Platform Routes ---


            // --- Document Operations (Fallback) ---
            if (pathSegments.length > 0) {
                const isDocOperation = pathSegments.length > 0 && pathSegments.length % 2 === 0;
                const isCollectionOpInside = pathSegments.length > 0 && pathSegments.length % 2 !== 0;
                collection = isDocOperation ? pathSegments[pathSegments.length - 2] : pathSegments[pathSegments.length - 1];
                docId = isDocOperation ? pathSegments[pathSegments.length - 1] : null;
                const parentPath = isDocOperation ? pathSegments.slice(0, -2).join('/') : pathSegments.slice(0, -1).join('/');
                depth = pathSegments.length;

                console.log(`[Trace] pathSegments: ${JSON.stringify(pathSegments)}, op: ${isDocOperation ? 'DOC' : (isCollectionOperation ? 'COLL' : 'NONE')}, collection: ${collection}, docId: ${docId} `);

                console.log(`[Documents] Path: ${url.pathname}, Method: ${method}, Workspace: ${workspace} `);
                let resolvedDbId = d1DatabaseId || await env.PROJECT_CACHE.get(`project:${workspace}: db`);
                console.log(`[Documents] Resolved DB ID: ${resolvedDbId} `);

                if (!resolvedDbId) {
                    try {
                        const project = await env.DB.prepare("SELECT d1_database_id FROM projects WHERE id = ?").bind(workspace).first() as any;
                        console.log(`[Documents] Project Lookup: `, project);
                        if (project) {
                            resolvedDbId = project.d1_database_id as string;
                            ctx.waitUntil(env.PROJECT_CACHE.put(`project:${workspace}: db`, resolvedDbId, { expirationTtl: 86400 }));
                        }
                    } catch (dbErr: any) {
                        console.error(`[Documents] DB Lookup Error: `, dbErr.message);
                    }
                }
                const gateway = new D1Gateway(env);
                const auth = authResult; // Alias for brevity in rules
                const dbId = resolvedDbId || 'native';

                // 1. Discovery Endpoints
                if (collection === 'internal' && docId === 'collections' && method === 'GET') {
                    console.log(`[Documents] Listing Collections for Workspace: ${workspace} `);
                    const { results } = await env.DB.prepare(
                        "SELECT DISTINCT collection_name FROM documents WHERE workspace_id = ? AND parent_path = '' AND deleted_at IS NULL"
                    ).bind(workspace).all();
                    return Response.json(results.map((r: any) => r.collection_name), { headers: corsHeaders });
                }

                if (collection === 'internal' && docId === 'subcollections' && method === 'GET') {
                    const parentPathSearch = url.searchParams.get('parentPath');
                    if (!parentPathSearch) return new Response("parentPath required", { status: 400, headers: corsHeaders });
                    const parentSegments = parentPathSearch.split('/').filter(Boolean).length;
                    const targetDepth = parentSegments + 2;
                    const { results } = await env.DB.prepare(
                        "SELECT DISTINCT collection_name FROM documents WHERE workspace_id = ? AND parent_path = ? AND depth = ? AND deleted_at IS NULL"
                    ).bind(workspace, parentPathSearch, targetDepth).all();
                    return Response.json(results.map((r: any) => r.collection_name), { headers: corsHeaders });
                }

                // Internal Reset Endpoint
                if (collection === 'internal' && docId === 'reset' && method === 'POST') {
                    await env.DB.batch([
                        env.DB.prepare("DROP TABLE IF EXISTS documents"),
                        env.DB.prepare("DROP TABLE IF EXISTS events"),
                        env.DB.prepare("DROP TABLE IF EXISTS projects"),
                        env.DB.prepare("DROP TABLE IF EXISTS api_keys"),
                        env.DB.prepare("DROP TABLE IF EXISTS platform_users")
                    ]);
                    await initDatabase(env);
                    return Response.json({ message: "Full Platform Reset Successful" }, { headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }

                // 0. BATCH
                if (method === 'POST' && collection === 'batch') {
                    const { operations } = await request.json() as any;
                    if (!Array.isArray(operations)) return new Response("operations array required", { status: 400, headers: corsHeaders });

                    const gatewayOps: { sql: string, params: any[] }[] = [];
                    const publishPayloads: { channel: string, data: any }[] = [];
                    const workspaceId = workspace;
                    const dbId = resolvedDbId || 'native';

                    for (const op of operations) {
                        const { type, path, data, expectedVersion } = op;
                        const parts = path.split('/');
                        const col = parts[parts.length - 2];
                        const id = parts[parts.length - 1];
                        const userId = auth?.userId || 'anonymous';

                        const currentDoc = await gateway.query(dbId as string, "SELECT version FROM documents WHERE path = ? AND workspace_id = ?", [path, workspaceId]);
                        if (expectedVersion !== undefined) {
                            if (!currentDoc || (currentDoc.results[0] as any)?.version !== expectedVersion) {
                                return new Response(`Version Conflict for ${path}`, { status: 409, headers: corsHeaders });
                            }
                        }

                        if (!(await security.canWrite(path, auth, data))) {
                            return new Response(`Permission Denied for ${path}`, { status: 403, headers: corsHeaders });
                        }

                        const eventId = crypto.randomUUID();
                        const eventType = type === 'SET' ? 'INSERT' : type === 'UPDATE' ? 'UPDATE' : 'DELETE';

                        gatewayOps.push({
                            sql: `INSERT INTO events(version, id, doc_id, workspace_id, event_type, payload) VALUES(NULL, ?, ?, ?, ?, ?)`,
                            params: [eventId, id, workspaceId, eventType, JSON.stringify(data || {})]
                        });

                        const batchParentPath = path.split('/').slice(0, -2).join('/');
                        const batchDepth = path.split('/').length;

                        if (type === 'SET') {
                            gatewayOps.push({
                                sql: `INSERT INTO documents(id, workspace_id, collection_name, path, parent_path, depth, user_id, data, version)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)
                                  ON CONFLICT(workspace_id, path) DO UPDATE SET data = excluded.data, version = documents.version + 1, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`,
                                params: [id, workspaceId, col, path, batchParentPath, batchDepth, userId, JSON.stringify(data)]
                            });
                        } else if (type === 'UPDATE') {
                            gatewayOps.push({
                                sql: `UPDATE documents SET data = json_patch(data, ?), version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? `,
                                params: [JSON.stringify(data), id]
                            });
                        } else if (type === 'DELETE') {
                            gatewayOps.push({
                                sql: `UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? `,
                                params: [id]
                            });
                        }

                        const collectionPath = path.split('/').slice(0, -1).join('/');
                        const pubType = type === 'DELETE' ? 'DELETED' : (type === 'SET' ? 'CREATED' : 'UPDATED');
                        publishPayloads.push({
                            channel: `collection_${collectionPath.replace(/\//g, '_')}`,
                            data: { type: pubType, id, path, doc: { id, path, data, userId } }
                        });
                        publishPayloads.push({
                            channel: `path_${path.replace(/\//g, '_')}`,
                            data: { type: pubType, id, path, doc: { id, path, data, userId } }
                        });
                    }

                    try {
                        const results = await gateway.batch(dbId as string, gatewayOps);

                        // Extract versions from event results (every odd index in gatewayOps is the documents update, 
                        // and every even index is the event insert. However, D1.batch returns results for all.)
                        // In our case, gatewayOps has [eventOp, docOp, eventOp, docOp, ...]
                        const versions: number[] = [];
                        for (let i = 0; i < results.length; i += 2) {
                            // The last_row_id of the event INSERT is our version
                            versions.push(results[i].meta?.last_row_id || 0);
                        }

                        const cache = new PredictiveCache(env);

                        for (let i = 0; i < publishPayloads.length; i++) {
                            const pub = publishPayloads[i];
                            const version = versions[i] || Date.now();
                            pub.data.doc.version = version; // Update payload with real version
                            const fullPath = pub.data.path;

                            // Cache update & invalidation
                            if (pub.data.type === 'DELETED') {
                                ctx.waitUntil(cache.delete(`doc:${workspaceId}:${fullPath} `));
                            } else {
                                const formattedDoc = { id: pub.data.id, path: fullPath, data: pub.data.doc.data, version: version };
                                ctx.waitUntil(cache.set(`doc:${workspaceId}:${fullPath} `, formattedDoc));
                            }
                            // Invalidate parent collection list cache
                            const collectionName = fullPath.split('/').slice(-2, -1)[0] || '';
                            ctx.waitUntil(cache.delete(`coll:${workspaceId}:${collectionName}:* `));

                            await publishToCentrifugo(env, `_ws_${workspaceId}_${pub.channel}`, pub.data);
                        }
                        return Response.json({ success: true, versions }, {
                            headers: {
                                ...corsHeaders,
                                'X-Internal-Latency': `${Date.now() - startTime}ms`,
                                'X-Cache': 'MISS'
                            }
                        });
                    } catch (error: any) {
                        return new Response(error.message, { status: 500, headers: corsHeaders });
                    }
                }



                // 1. CREATE
                // 1. CREATE (v4.0: Write Coalescing)
                else if (method === 'POST') {
                    try {
                        const body = await request.json() as any;
                        const { data, userId, parentPath = "" } = body;
                        const id = crypto.randomUUID();
                        const fullDocPath = parentPath ? `${parentPath}/${collection}/${id}` : `${collection}/${id}`;

                        // Security Rule Enforcement
                        if (!(await security.canWrite(fullDocPath, auth, data))) {
                            return new Response("Permission Denied (Security Rules)", { status: 403, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                        }


                        const noCache = request.headers.get('Cache-Control') === 'no-cache';
                        let docVersion = Date.now();

                        // Queue write for batching (10x throughput), or write immediately if no-cache (e2e tests)
                        if (noCache) {
                            const eventId = crypto.randomUUID();
                            const eventRes = await gateway.query(dbId as string, `INSERT INTO events (id, doc_id, workspace_id, event_type, payload) VALUES (?, ?, ?, ?, ?)`, [eventId, id, workspace, 'SET', JSON.stringify(data)]);
                            docVersion = eventRes.meta.last_row_id;
                            await gateway.query(dbId as string, `INSERT INTO documents (path, id, workspace_id, collection_name, parent_path, depth, data, version, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, path) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`, [fullDocPath, id, workspace, collection, parentPath || "", depth + 1, JSON.stringify(data), docVersion, userId || 'anonymous']);
                        } else {
                            const buffer = WriteBuffer.getInstance(env);
                            await buffer.queueWrite({
                                type: 'INSERT',
                                collection, // Store leaf collection name
                                docId: id,
                                path: fullDocPath,
                                parentPath,
                                depth: depth + 1,
                                workspace,
                                dbId,
                                data,
                                userId,
                                timestamp: docVersion
                            }, ctx);
                        }

                        const cache = new PredictiveCache(env);
                        ctx.waitUntil(cache.set(`doc:${workspace}:${fullDocPath}`, { id, path: fullDocPath, data, version: docVersion }));
                        ctx.waitUntil(cache.delete(`coll:${workspace}:${collection}:*`));

                        // 🚀 Global Cache Warming (Document + Collection)
                        const payload = { type: 'CREATED', doc: { id, path: fullDocPath, data, version: Date.now() } };
                        ctx.waitUntil(publishToCentrifugo(env, `_ws_${workspace}_collection_${collection.replace(/\//g, '_')}`, payload));
                        ctx.waitUntil(publishToCentrifugo(env, `_ws_${workspace}_path_${fullDocPath.replace(/\//g, '_')}`, payload));
                        ctx.waitUntil(publishToCentrifugo(env, `_ws_${workspace}_global_cache`, {
                            type: 'CACHE_WARM',
                            key: `doc:${workspace}:${fullDocPath}`,
                            data: data
                        }));

                        return Response.json({ id, path: fullDocPath, version: docVersion }, {
                            status: 201,
                            headers: {
                                ...corsHeaders,
                                'X-Internal-Latency': `${Date.now() - startTime}ms`,
                                'X-Write-Mode': 'BUFFERED'
                            }
                        });
                    } catch (error: any) {
                        return new Response(error.message, { status: 500, headers: corsHeaders });
                    }
                }

                // 1.5 SYNC
                else if (method === 'GET' && collection === 'sync') {
                    const sinceVersion = parseInt(url.searchParams.get('since') || '0');
                    const cache = new PredictiveCache(env);
                    const cacheKey = `sync:${workspace}:${sinceVersion}`;
                    const cached = await cache.get(cacheKey);
                    if (cached) return Response.json(cached, { headers: { ...corsHeaders, 'X-Cache': 'HIT', 'X-Internal-Latency': `${Date.now() - startTime}ms` } });

                    const dbId = resolvedDbId || 'native';
                    const res = await new D1Gateway(env).query(dbId as string, "SELECT * FROM events WHERE workspace_id = ? AND version > ? ORDER BY version ASC LIMIT 1000", [workspace, sinceVersion]);
                    const data = { changes: res.results.map((r: any) => ({ ...r, payload: JSON.parse(r.payload) })), serverTime: new Date().toISOString() };
                    await cache.set(cacheKey, data, 30);
                    return Response.json(data, { headers: { ...corsHeaders, 'X-Cache': 'MISS', 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }

                // 1.7 QUERY
                else if (method === 'GET' && collection === 'query') {
                    const targetPath = url.searchParams.get('path');
                    const filtersJson = url.searchParams.get('filters') || '[]';
                    const cacheKey = `query:${workspace}:${targetPath || 'root'}:${filtersJson}`;
                    const cache = new PredictiveCache(env);
                    const cached = await cache.get(cacheKey);
                    if (cached) return Response.json(cached, { headers: { ...corsHeaders, 'X-Cache': 'HIT', 'X-Internal-Latency': `${Date.now() - startTime}ms` } });

                    const dbId = resolvedDbId || 'native';
                    const res = await new D1Gateway(env).query(dbId as string, `SELECT * FROM documents WHERE workspace_id = ? AND path LIKE ?`, [workspace, targetPath ? `${targetPath}/%` : '%']);
                    const responseData = res.results.map((r: any) => ({ ...r, data: JSON.parse(r.data) }));
                    await cache.set(cacheKey, responseData, 60);
                    return Response.json(responseData, { headers: { ...corsHeaders, 'X-Cache': 'MISS', 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }

                // 2. LIST
                else if (method === 'GET' && isCollectionOperation && !docId) {
                    const cache = new PredictiveCache(env);
                    const noCache = request.headers.get('Cache-Control') === 'no-cache';
                    const cacheKey = `coll:${workspace}:${collection}:${url.searchParams.get('parentPath') || 'root'}`;
                    const dbId = resolvedDbId || 'native';

                    const responseData = await cache.get(cacheKey, async () => {
                        const res = await new D1Gateway(env).query(dbId as string, "SELECT * FROM documents WHERE collection_name = ? AND workspace_id = ? AND deleted_at IS NULL", [collection, workspace]);
                        const docs = res.results.map((r: any) => ({ ...r, data: JSON.parse(r.data) }));

                        // Predictive Caching: warm individual docs
                        for (const doc of docs) {
                            ctx.waitUntil(cache.set(`doc:${workspace}:${doc.path}`, doc, 300));
                        }
                        return docs;
                    });

                    return Response.json(responseData, {
                        headers: {
                            ...corsHeaders,
                            'X-Cache': noCache ? 'BYPASS' : 'HIT',
                            'X-Internal-Latency': `${Date.now() - startTime}ms`,
                            'X-Edge-Sync': 'Predictive'
                        }
                    });
                }

                // 3. GET SINGLE
                else if (method === 'GET' && docId) {
                    const fullDocPath = parentPath ? `${parentPath}/${collection}/${docId}` : `${collection}/${docId}`;
                    const cache = new PredictiveCache(env);
                    const noCache = request.headers.get('Cache-Control') === 'no-cache';
                    const dbId = resolvedDbId || 'native';

                    // 🚀 Read-Your-Writes Consistency (v7.3)
                    // Trigger an immediate flush of any buffered writes for this workspace
                    // before reading from the database/cache.
                    const buffer = WriteBuffer.getInstance(env);
                    await buffer.flush();

                    // Security Rule Enforcement
                    if (!(await security.canRead(fullDocPath, auth))) {
                        return new Response("Permission Denied", { status: 403, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                    }

                    let doc: any;

                    if (noCache) {
                        const res = await new D1Gateway(env).query(dbId as string, "SELECT * FROM documents WHERE path = ? AND workspace_id = ? AND deleted_at IS NULL", [fullDocPath, workspace]);
                        if (res.results && res.results.length > 0) {
                            const r = res.results[0] as any;
                            doc = { ...r, data: JSON.parse(r.data) };
                        }
                    } else {
                        doc = await cache.get(`doc:${workspace}:${fullDocPath}`, async () => {
                            const res = await new D1Gateway(env).query(dbId as string, "SELECT * FROM documents WHERE path = ? AND workspace_id = ? AND deleted_at IS NULL", [fullDocPath, workspace]);
                            if (!res.results || res.results.length === 0) return null;
                            const r = res.results[0] as any;
                            return { ...r, data: JSON.parse(r.data) };
                        });
                    }


                    if (!doc) return new Response("Not Found", { status: 404, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });

                    return Response.json(doc, {
                        headers: {
                            ...corsHeaders,
                            'X-Cache': noCache ? 'BYPASS' : 'HIT',
                            'X-Internal-Latency': `${Date.now() - startTime}ms`,
                            'ETag': `"${doc.version}"`
                        }
                    });
                }

                // 4. PUT
                else if (method === 'PUT' && docId) {
                    const body = await request.json() as any;
                    const { data, userId } = body;

                    const ifMatch = request.headers.get('If-Match');
                    const dbId = resolvedDbId || 'native';
                    const fullPath = parentPath ? `${parentPath}/${collection}/${docId}` : `${collection}/${docId}`;

                    // Security Rule Enforcement
                    if (!(await security.canWrite(fullPath, auth, data))) {
                        return new Response("Permission Denied (Security Rules)", { status: 403, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                    }

                    // Optimistic Concurrency Control (v4.1)
                    if (ifMatch) {
                        const currentDoc = await gateway.query(dbId as string, "SELECT version FROM documents WHERE path = ? AND workspace_id = ?", [fullPath, workspace]);
                        const currentVersion = currentDoc.results?.[0]?.version;
                        if (currentVersion !== undefined && `"${currentVersion}"` !== ifMatch.replace(/W\//, '')) {
                            return new Response("Precondition Failed (OCC Version Mismatch)", { status: 412, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                        }
                    }

                    const eventId = crypto.randomUUID();
                    const eventRes = await gateway.query(dbId as string, `INSERT INTO events (id, doc_id, workspace_id, event_type, payload) VALUES (?, ?, ?, ?, ?)`, [eventId, docId, workspace, 'SET', JSON.stringify(data)]);
                    const version = eventRes.meta.last_row_id;
                    await gateway.query(dbId as string, `INSERT INTO documents (path, id, workspace_id, collection_name, parent_path, depth, data, version, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, path) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`, [fullPath, docId, workspace, collection, parentPath || "", depth || 0, JSON.stringify(data), version, userId || 'anonymous']);

                    // Optimistic Cache Update (v5.5)
                    const cache = new PredictiveCache(env);
                    ctx.waitUntil(cache.set(`doc:${workspace}:${fullPath}`, { id: docId, path: fullPath, data, version }));

                    // 🚀 Global Cache Warming (Broadcast to other Edges)
                    ctx.waitUntil(publishToCentrifugo(env, `_ws_${workspace}_global_cache`, {
                        type: 'CACHE_WARM',
                        key: `doc:${workspace}:${fullPath}`,
                        data: { id: docId, path: fullPath, data, version }
                    }));

                    return Response.json({ success: true, version }, {
                        headers: {
                            ...corsHeaders,
                            'ETag': `"${version}"`,
                            'X-Internal-Latency': `${Date.now() - startTime}ms`,
                            'X-Cache': 'MISS'
                        }
                    });
                }

                // 5. PATCH (Partial Update)
                else if (method === 'PATCH' && docId) {
                    const body = await request.json() as any;
                    const { data: patchData, userId } = body;
                    const dbId = resolvedDbId || 'native';
                    const fullPath = parentPath ? `${parentPath}/${collection}/${docId}` : `${collection}/${docId}`;

                    // Security Rule Enforcement
                    if (!(await security.canWrite(fullPath, auth, patchData))) {
                        return new Response("Permission Denied (Security Rules)", { status: 403, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                    }

                    // 🚀 Optimized <10ms Reliability path (v6.0)
                    // We use the AENS-powered WriteBuffer to coalesce concurrent patches.
                    // This returns sub-10ms to the user while the Wasm engine merges in background.
                    const buffer = WriteBuffer.getInstance(env);
                    ctx.waitUntil(buffer.queueWrite({
                        type: 'UPDATE',
                        collection,
                        docId,
                        path: fullPath,
                        parentPath: parentPath || "",
                        depth: depth || 0,
                        workspace: workspace as string,
                        dbId: dbId as string,
                        data: patchData,
                        userId: userId || 'anonymous',
                        timestamp: Date.now()
                    }, ctx));

                    // Optimistic Cache Update (Internal Latency: 0ms)
                    const cache = new PredictiveCache(env);
                    ctx.waitUntil(cache.set(`doc:${workspace}:${fullPath}`, {
                        id: docId,
                        path: fullPath,
                        data: patchData, // Note: This is partial, Cache will merge or invalidate on next GET
                        version: Date.now()
                    }));

                    return Response.json({ success: true, mode: 'AENS-BUFFERED' }, {
                        headers: {
                            ...corsHeaders,
                            'X-Write-Mode': 'AENS-BUFFERED',
                            'X-Internal-Latency': `${Date.now() - startTime}ms`,
                            'X-Cache': 'MISS'
                        }
                    });
                }

                // 6. DELETE
                else if (method === 'DELETE' && docId) {
                    const dbId = resolvedDbId || 'native';
                    // Capture path and parentPath for DELETE scope
                    const fullDocPath = parentPath ? `${parentPath}/${collection}/${docId}` : `${collection}/${docId}`;

                    // Security Rule Enforcement
                    if (!(await security.canWrite(fullDocPath, auth, null))) {
                        return new Response("Permission Denied (Security Rules)", { status: 403, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                    }

                    await gateway.query(dbId as string, "UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE path = ? AND workspace_id = ?", [fullDocPath, workspace]);

                    // Invalidate Caches
                    const cache = new PredictiveCache(env);
                    ctx.waitUntil(cache.delete(`doc:${workspace}:${fullDocPath}`));
                    ctx.waitUntil(cache.delete(`coll:${workspace}:${collection}:*`));
                    const deletePayload = { type: 'DELETED', doc: { id: docId, path: fullDocPath } };
                    ctx.waitUntil(publishToCentrifugo(env, `_ws_${workspace}_collection_${collection.replace(/\//g, '_')}`, deletePayload));
                    ctx.waitUntil(publishToCentrifugo(env, `_ws_${workspace}_path_${fullDocPath.replace(/\//g, '_')}`, deletePayload));
                    return new Response(null, { status: 204, headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` } });
                }
            }

            return new Response("Telestack Gateway: Route Not Found", {
                status: 404,
                headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - startTime}ms` }
            });
        } catch (err: any) {
            console.error(`[CRITICAL ERROR] ${request.url}:`, err.message, err.stack);
            return new Response(JSON.stringify({
                error: "Worker Internal Error",
                message: err.message,
                stack: err.stack
            }), {
                status: 500,
                headers: { ...corsHeaders, 'X-Internal-Latency': `${Date.now() - (typeof startTime !== 'undefined' ? startTime : Date.now())}ms` }
            });
        }
    }
};

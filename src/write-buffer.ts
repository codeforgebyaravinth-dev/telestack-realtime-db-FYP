import { Env } from './types';
import { D1Gateway } from './d1-gateway';
import initWasm, { CrdtEngine, AensEngine, PvcEngine, ActEngine, AcscEngine } from '../wasm-engine/pkg/wasm_engine';
import wasmModule from '../wasm-engine/pkg/wasm_engine_bg.wasm';
import { PredictiveCache } from './cache';

interface WriteOperation {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    collection: string;
    docId: string;
    path: string;
    parentPath: string;
    depth: number;
    workspace: string;
    dbId?: string;
    data?: any;
    userId?: string;
    timestamp: number;
}

// Deep merge two plain objects - used as CRDT fallback to ensure no strokes are lost
function deepMerge(base: any, patch: any): any {
    if (typeof base !== 'object' || base === null) return patch;
    if (typeof patch !== 'object' || patch === null) return patch;
    const result = { ...base };
    for (const key of Object.keys(patch)) {
        if (typeof patch[key] === 'object' && patch[key] !== null && typeof result[key] === 'object' && result[key] !== null) {
            result[key] = deepMerge(result[key], patch[key]);
        } else {
            result[key] = patch[key];
        }
    }
    return result;
}

export class WriteBuffer {
    private static buffer: WriteOperation[] = [];
    private static bufferSize = 100;
    private static flushInterval = 100; // ms
    private static lastFlush = Date.now();
    private static isProcessing = false;
    private static velocityTracker = new Map<string, number>();
    private static varianceTracker = new Map<string, number[]>();
    private static lastSampleTime = Date.now();
    private static currentTopology = new Map<string, string>();
    private static flushTimer: any = null;
    private static metrics = {
        totalBatches: 0,
        totalEventsCoalesced: 0,
        lastBatchSize: 0,
        lastCompressionKeyCount: 0,
        lastFlushSuccess: true,
        lastError: null as string | null
    };
    private static wasmInitPromise: Promise<void> | null = null;

    private static instance: WriteBuffer | null = null;

    private constructor(private env: Env) {
        if (!WriteBuffer.wasmInitPromise) {
            WriteBuffer.wasmInitPromise = initWasm(wasmModule).then(() => { });
        }
    }

    public static getTopology(workspace: string, path: string): string {
        return WriteBuffer.currentTopology.get(`${workspace}:${path}`) || 'COLD';
    }

    public static getMetrics() {
        return WriteBuffer.metrics;
    }

    public static getInstance(env: Env): WriteBuffer {
        if (!WriteBuffer.instance) {
            WriteBuffer.instance = new WriteBuffer(env);
        }
        return WriteBuffer.instance;
    }

    async queueWrite(op: WriteOperation, ctx?: ExecutionContext): Promise<void> {
        if (WriteBuffer.wasmInitPromise) await WriteBuffer.wasmInitPromise;

        WriteBuffer.buffer.push(op);

        // AENS Algorithm: Update Velocity Tracker (ops per second)
        const now = Date.now();
        const docKey = `${op.workspace}:${op.path}`;
        const currentRate = (WriteBuffer.velocityTracker.get(docKey) || 0) + 1;
        WriteBuffer.velocityTracker.set(docKey, currentRate);

        // Reset rates every 1s (sliding window)
        if (now - WriteBuffer.lastSampleTime > 1000) {
            WriteBuffer.velocityTracker.clear();
            WriteBuffer.lastSampleTime = now;
        }

        // AENS: Moved to WASM for high-performance thresholding
        const velocity = Math.max(1, currentRate);

        // 🚀 ACT (Adaptive Contention Topology) Enhancement (v8.0)
        // Tracks the variance of writes to identify jitter vs steady stream
        const times = WriteBuffer.varianceTracker.get(docKey) || [];
        times.push(now);
        if (times.length > 20) times.shift();
        WriteBuffer.varianceTracker.set(docKey, times);

        let variance = 0;
        if (times.length > 1) {
            const diffs = times.slice(1).map((t, i) => t - times[i]);
            const avg = diffs.reduce((a, b) => a + b) / diffs.length;
            variance = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / diffs.length);
        }

        const actScore = ActEngine.calculate_score(velocity, WriteBuffer.buffer.length, variance);
        const topology = ActEngine.classify(actScore);
        WriteBuffer.currentTopology.set(docKey, topology);

        // Map topology to base window (Research Constants)
        const topologyWindow = {
            'COLD': 50,
            'WARM': 250,
            'HOT': 1000,
            'CRITICAL': 2000
        }[topology] || 500;

        const adaptiveThreshold = AensEngine.calculate_threshold(velocity, 0.5, WriteBuffer.buffer.length, topologyWindow);

        // 🚀 PVC (Predictive Vector Clocks) Enhancement (v7.5)
        let pvcAdjustment = 1.0;
        const existingDocWrites = WriteBuffer.buffer.filter(b => `${b.workspace}:${b.path}` === docKey);

        if (existingDocWrites.length > 0 && op.data) {
            try {
                const lastOpData = existingDocWrites[existingDocWrites.length - 1].data;
                if (lastOpData) {
                    const hasConflict = PvcEngine.has_path_conflict(
                        JSON.stringify(lastOpData),
                        JSON.stringify(op.data)
                    );
                    if (!hasConflict) pvcAdjustment = 0.6;
                }
            } catch (e) { console.error("PVC Error:", e); }
        }

        const finalThreshold = adaptiveThreshold * pvcAdjustment;
        const stability = AensEngine.calculate_stability_index(velocity, finalThreshold);

        // Report Telemetry (v8.0 - ACT + PVC + ACSC Enabled)
        if (typeof (globalThis as any).updateAensMetrics === 'function') {
            (globalThis as any).updateAensMetrics({
                lastThreshold: finalThreshold,
                lastVelocity: velocity,
                lastStability: stability,
                pvcSignal: pvcAdjustment < 1.0 ? 'FAST-TRACK' : 'SYNC-LOCKED',
                topology: topology,
                actScore: actScore
            });
        }

        if (ctx) {
            ctx.waitUntil(this.scheduleFlush(finalThreshold, ctx));
        } else {
            await this.scheduleFlush(finalThreshold);
        }
    }

    private async scheduleFlush(threshold: number, ctx?: ExecutionContext): Promise<void> {
        // 🚀 Delayed Edge Synthesis (v9.1)
        // Ensures that "trapped" writes are flushed even if no more requests arrive.
        if (WriteBuffer.buffer.length >= WriteBuffer.bufferSize) {
            await this.flush(ctx);
            return;
        }

        if (WriteBuffer.flushTimer) return; // Already scheduled

        const timeSinceLastFlush = Date.now() - WriteBuffer.lastFlush;
        const remainingTime = Math.max(0, threshold - timeSinceLastFlush);

        if (remainingTime === 0) {
            await this.flush(ctx);
        } else {
            // Schedule the safety flush
            WriteBuffer.flushTimer = true;
            const flushAction = async () => {
                WriteBuffer.flushTimer = null;
                await this.flush(ctx);
            };

            if (ctx) {
                ctx.waitUntil(new Promise(resolve => {
                    setTimeout(async () => {
                        await flushAction();
                        resolve(null);
                    }, remainingTime);
                }));
            } else {
                setTimeout(flushAction, remainingTime);
            }
        }
    }

    async flush(ctx?: ExecutionContext): Promise<void> {

        if (WriteBuffer.isProcessing || WriteBuffer.buffer.length === 0) {
            return;
        }

        WriteBuffer.isProcessing = true;
        try {
            while (WriteBuffer.buffer.length > 0) {
                const batch = [...WriteBuffer.buffer];
                WriteBuffer.buffer = [];
                WriteBuffer.lastFlush = Date.now();

                const merged = this.mergeWrites(batch);
                console.log(`[WRITE BUFFER] Batch collected: ${batch.length} ops. Compressed into: ${merged.length} docs.`);

                WriteBuffer.metrics.totalBatches++;
                WriteBuffer.metrics.totalEventsCoalesced += batch.length;
                WriteBuffer.metrics.lastBatchSize = batch.length;

                await this.executeBatch(merged, ctx);
            }
        } catch (e: any) {
            WriteBuffer.metrics.lastError = e.message;
            WriteBuffer.metrics.lastFlushSuccess = false;
            console.error(`[WRITE BUFFER] Flush Error: ${e.message}`);
        } finally {
            WriteBuffer.isProcessing = false;
        }
    }

    private mergeWrites(writes: WriteOperation[]): WriteOperation[] {
        const map = new Map<string, WriteOperation[]>();

        // Group by path
        for (const write of writes) {
            const key = `${write.workspace}:${write.path}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(write);
        }

        const merged: WriteOperation[] = [];

        for (const [key, docWrites] of map.entries()) {
            const path = docWrites[0].path;
            if (docWrites.length === 1) {
                console.log(`[WriteBuffer] Single write for ${path}, bypassing ACSC.`);
                merged.push(docWrites[0]);
                continue;
            }

            // 🚀 ACSC (Adaptive Conflict-Free State Compression) Algorithm (v8.0)
            try {
                const opsData = docWrites.map(o => o.data);
                const compressedJson = AcscEngine.compress_batch(JSON.stringify(opsData));
                const compressedData = JSON.parse(compressedJson);
                const keyCount = Object.keys(compressedData).length;
                console.log(`[WriteBuffer] ACSC Compressed ${opsData.length} raw ops into ${keyCount} keys for ${path}`);

                const first = docWrites[0];
                merged.push({
                    ...first,
                    data: compressedData,
                    timestamp: Math.max(...docWrites.map(o => o.timestamp))
                });

                WriteBuffer.metrics.lastCompressionKeyCount = keyCount;
            } catch (e) {
                console.error(`[WriteBuffer] ACSC Error for ${path}, falling back:`, e);
                merged.push(docWrites[docWrites.length - 1]);
            }
        }

        return merged;
    }

    private async executeBatch(operations: WriteOperation[], ctx?: ExecutionContext): Promise<void> {
        if (operations.length === 0) return;

        const gateway = new D1Gateway(this.env);
        const workspace = operations[0].workspace;
        const dbId = 'native';

        // Optimization 4: Cache JSON serialization
        const jsonCache = new Map<any, string>();
        const getJson = (obj: any) => {
            if (!jsonCache.has(obj)) {
                jsonCache.set(obj, JSON.stringify(obj));
            }
            return jsonCache.get(obj)!;
        };

        // Build batch SQL
        const statements: { sql: string; params: any[] }[] = [];

        for (const op of operations) {
            if (op.type === 'INSERT' || op.type === 'UPDATE') {
                const eventId = crypto.randomUUID();
                const version = Date.now();

                // Event log
                statements.push({
                    sql: `INSERT INTO events (id, doc_id, workspace_id, event_type, payload) VALUES (?, ?, ?, ?, ?)`,
                    params: [eventId, op.docId, op.workspace, op.type, getJson(op.data)]
                });

                statements.push({
                    sql: `INSERT INTO documents (path, id, workspace_id, collection_name, parent_path, depth, data, version, user_id) 
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
                          ON CONFLICT(workspace_id, path) DO UPDATE SET 
                          data = json_patch(CASE WHEN json_valid(data) THEN data ELSE '{}' END, json(excluded.data)), 
                          version = excluded.version, 
                          updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`,
                    params: [op.path, op.docId, op.workspace, op.collection, op.parentPath || "", op.depth || 0, getJson(op.data), version, op.userId || 'anonymous']
                });
            } else if (op.type === 'DELETE') {
                statements.push({
                    sql: `UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE path = ? AND workspace_id = ?`,
                    params: [op.path, workspace]
                });
            }
        }

        // Execute all in single batch
        try {
            const results = await gateway.batch(dbId, statements);
            console.log(`[WriteBuffer] D1 Flush SUCCESS: ${results.length} statements executed.`);
            WriteBuffer.metrics.lastFlushSuccess = true;
        } catch (e: any) {
            WriteBuffer.metrics.lastFlushSuccess = false;
            WriteBuffer.metrics.lastError = e.message;
            console.error(`[WriteBuffer] D1 Batch Error: ${e.message}`);
            throw e;
        }

        // 🚀 Post-Flush Cache Invalidation (v7.7)
        // Ensure that any reads following this flush get fresh data from D1
        const cache = new PredictiveCache(this.env);
        for (const op of operations) {
            if (ctx) {
                ctx.waitUntil(cache.delete(`doc:${workspace}:${op.path}`));
                ctx.waitUntil(cache.delete(`coll:${workspace}:${op.collection}:*`));
            } else {
                await cache.delete(`doc:${workspace}:${op.path}`);
                await cache.delete(`coll:${workspace}:${op.collection}:*`);
            }
        }
    }
}

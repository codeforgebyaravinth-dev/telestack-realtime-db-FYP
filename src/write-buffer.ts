import { Env } from './types';
import { D1Gateway } from './d1-gateway';
import initWasm, { CrdtEngine, AensEngine, PvcEngine } from '../wasm-engine/pkg/wasm_engine';
import wasmModule from '../wasm-engine/pkg/wasm_engine_bg.wasm';

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
    private static lastSampleTime = Date.now();
    private static wasmInitPromise: Promise<void> | null = null;

    private static instance: WriteBuffer | null = null;

    private constructor(private env: Env) {
        if (!WriteBuffer.wasmInitPromise) {
            WriteBuffer.wasmInitPromise = initWasm(wasmModule).then(() => { });
        }
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
        const adaptiveThreshold = AensEngine.calculate_threshold(velocity, 0.5, WriteBuffer.buffer.length, 500);

        // 🚀 PVC (Predictive Vector Clocks) Enhancement (v7.5)
        // If the new write doesn't conflict with existing buffered writes for this doc, 
        // we can fast-track the flush (reduce wait time by 40%)
        let pvcAdjustment = 1.0;
        const existingDocWrites = WriteBuffer.buffer.filter(b => `${b.workspace}:${b.path}` === docKey);

        if (existingDocWrites.length > 0 && op.data) {
            try {
                // Check if the last buffered write for this doc overlaps path-wise with the new one
                const lastOpData = existingDocWrites[existingDocWrites.length - 1].data;
                if (lastOpData) {
                    const hasConflict = PvcEngine.has_path_conflict(
                        JSON.stringify(lastOpData),
                        JSON.stringify(op.data)
                    );
                    if (!hasConflict) {
                        pvcAdjustment = 0.6; // High-Disjointness Fast-Track
                    }
                }
            } catch (e) {
                console.error("PVC Engine Error:", e);
            }
        }

        const finalThreshold = adaptiveThreshold * pvcAdjustment;
        const stability = AensEngine.calculate_stability_index(velocity, finalThreshold);

        // Report Telemetry (v7.5 - PVC Enabled)
        if (typeof (globalThis as any).updateAensMetrics === 'function') {
            (globalThis as any).updateAensMetrics({
                lastThreshold: finalThreshold,
                lastVelocity: velocity,
                lastStability: stability,
                pvcSignal: pvcAdjustment < 1.0 ? 'FAST-TRACK' : 'SYNC-LOCKED'
            });
        }

        if (ctx) {
            ctx.waitUntil(this.scheduleFlush(finalThreshold));
        } else {
            await this.scheduleFlush(finalThreshold);
        }
    }

    private async scheduleFlush(threshold: number): Promise<void> {
        // Only trigger flush if threshold is met or buffer is full
        if (WriteBuffer.buffer.length >= WriteBuffer.bufferSize) {
            await this.flush();
        } else if (Date.now() - WriteBuffer.lastFlush >= threshold) {
            await this.flush();
        }
    }

    async flush(): Promise<void> {

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

                // Telemetry: Track coalescing efficiency
                if (typeof (globalThis as any).updateAensMetrics === 'function') {
                    const currentMetrics = (globalThis as any).metrics?.aens || {};
                    (globalThis as any).updateAensMetrics({
                        totalBatches: (currentMetrics.totalBatches || 0) + 1,
                        totalEventsCoalesced: (currentMetrics.totalEventsCoalesced || 0) + batch.length
                    });
                }

                await this.executeBatch(merged);
            }
        } catch (e: any) {
            console.error(`[WRITE BUFFER] Flush Error: ${e.message}`);
        } finally {
            WriteBuffer.isProcessing = false;
        }
    }

    private mergeWrites(writes: WriteOperation[]): WriteOperation[] {
        const map = new Map<string, WriteOperation>();

        for (const write of writes) {
            const key = `${write.workspace}:${write.path}`;
            const existing = map.get(key);

            if (!existing) {
                map.set(key, write);
            } else {
                // Same path: deep-merge data so no strokes are lost
                if ((write.type === 'UPDATE' || write.type === 'INSERT') && existing.data && write.data) {
                    try {
                        const mergedDataStr = CrdtEngine.merge_json(
                            JSON.stringify(existing.data),
                            JSON.stringify(write.data)
                        );
                        write.data = JSON.parse(mergedDataStr);
                    } catch (e) {
                        // CRDT merge failed - fall back to manual deep merge
                        write.data = deepMerge(existing.data, write.data);
                        console.error("WASM Merge Error, used deepMerge fallback:", e);
                    }
                }
                map.set(key, write);
            }
        }

        return Array.from(map.values());
    }

    private async executeBatch(operations: WriteOperation[]): Promise<void> {
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
                          data = json_patch(data, excluded.data), version = excluded.version, updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`,
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
        // NOTE: In a multi-tenant environment, we should group by dbId. 
        // For now, we assume one dbId per flush for simplicity or ensure it's passed.
        const opDbId = operations[0].dbId || 'native';
        await gateway.batch(opDbId, statements);
    }
}

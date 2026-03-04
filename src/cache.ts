import initWasm, { BloomFilter, AensEngine } from '../wasm-engine/pkg/wasm_engine';
import wasmModule from '../wasm-engine/pkg/wasm_engine_bg.wasm';
import { Env } from './types';

export class PredictiveCache {
    private static memCache = new Map<string, { data: any, expiry: number }>();
    private static bloom: BloomFilter | null = null;
    private static bloomInitPromise: Promise<void> | null = null;

    // Adaptive TTL tracking
    private static accessCount = new Map<string, number>();
    private static lastReset = Date.now();
    private static pendingPromises = new Map<string, Promise<any>>();

    constructor(private env: Env) {
        // Reset access counts every hour to adapt to changing heat
        if (Date.now() - PredictiveCache.lastReset > 3600000) {
            PredictiveCache.accessCount.clear();
            PredictiveCache.lastReset = Date.now();
        }

        // Trigger WASM init
        if (!PredictiveCache.bloom && !PredictiveCache.bloomInitPromise) {
            PredictiveCache.bloomInitPromise = (async () => {
                await initWasm(wasmModule);
                await this.initBloomInternal();
            })();
        }
    }

    private async initBloomInternal() {
        try {
            const meta = await this.env.PROJECT_CACHE.get('system:bloom:meta', { type: 'json' }) as any;
            const bitsBuffer = await this.env.PROJECT_CACHE.get('system:bloom:bits', { type: 'arrayBuffer' });

            if (meta && bitsBuffer) {
                PredictiveCache.bloom = BloomFilter.from_state(new Uint8Array(bitsBuffer), meta.size, meta.hashCount);
                console.log("✅ Bloom Filter restored from KV");
            } else {
                PredictiveCache.bloom = new BloomFilter(1_000_000, 0.01);
            }
        } catch (e) {
            console.warn("Failed to restore Bloom Filter, creating new:", e);
            PredictiveCache.bloom = new BloomFilter(1_000_000, 0.01);
        }
    }

    private async persistBloom(ctx?: ExecutionContext) {
        if (!PredictiveCache.bloom) return;
        const persist = async () => {
            try {
                const bits = PredictiveCache.bloom!.get_bits();
                const meta = {
                    size: PredictiveCache.bloom!.get_size(),
                    hash_count: PredictiveCache.bloom!.get_hash_count(),
                    timestamp: Date.now()
                };
                await this.env.PROJECT_CACHE.put('system:bloom:bits', bits.buffer.slice(0) as ArrayBuffer);
                await this.env.PROJECT_CACHE.put('system:bloom:meta', JSON.stringify(meta));
            } catch (e) {
                console.error("Failed to persist Bloom Filter:", e);
            }
        };

        if (ctx) {
            ctx.waitUntil(persist());
        } else {
            await persist();
        }
    }

    async get(key: string, fetcher?: () => Promise<any>): Promise<any | null> {
        // Wait for WASM Bloom Filter to initialize
        if (!PredictiveCache.bloom && PredictiveCache.bloomInitPromise) {
            await PredictiveCache.bloomInitPromise;
        }

        // 1. Bloom Filter Check (O(1) - <1μs)
        // [v6.2] Re-enabled now that filter is persisted across restarts
        if (PredictiveCache.bloom && !PredictiveCache.bloom.has(key)) {
            // Note: system keys bypass bloom if needed, but normally all docs should be here
            if (!key.startsWith('system:')) return null;
        }

        // Track Access for Adaptive TTL
        const currentCount = (PredictiveCache.accessCount.get(key) || 0) + 1;
        PredictiveCache.accessCount.set(key, currentCount);

        // 2. Tier 0: Memory Cache
        const now = Date.now();
        const mem = PredictiveCache.memCache.get(key);
        if (mem && mem.expiry > now) {
            // @ts-ignore
            if (typeof (globalThis as any).recordHit === 'function') (globalThis as any).recordHit();
            return mem.data;
        }

        // 3. Request Coalescing (Thundering Herd Protection)
        if (PredictiveCache.pendingPromises.has(key)) {
            console.log(`[CACHE COALESCE] Sharing promise for: ${key}`);
            return await PredictiveCache.pendingPromises.get(key);
        }

        // 4. Tier 1: KV Cache + Optional Fetcher
        const workPromise = (async () => {
            try {
                // Try KV first
                let data = await this.env.PROJECT_CACHE.get(key, { type: 'json' });

                if (data) {
                    // @ts-ignore
                    if (typeof (globalThis as any).recordHit === 'function') (globalThis as any).recordHit();
                } else {
                    // @ts-ignore
                    if (typeof (globalThis as any).recordMiss === 'function') (globalThis as any).recordMiss();
                }

                // Fallback to fetcher (D1) if KV empty
                if (!data && fetcher) {
                    console.log(`[CACHE MISS] Fetching from Source: ${key}`);
                    data = await fetcher();
                    if (data) {
                        await this.set(key, data);
                    }
                }

                if (data) {
                    const ttl = this.calculateAdaptiveTTL(currentCount);
                    PredictiveCache.memCache.set(key, { data, expiry: Date.now() + (ttl * 1000) });
                }

                return data;
            } catch (e) {
                return null;
            } finally {
                PredictiveCache.pendingPromises.delete(key);
            }
        })();

        PredictiveCache.pendingPromises.set(key, workPromise);
        return await workPromise;
    }

    async set(key: string, value: any, explicitTtl?: number): Promise<void> {
        // Wait for WASM Bloom Filter to initialize
        if (!PredictiveCache.bloom && PredictiveCache.bloomInitPromise) {
            await PredictiveCache.bloomInitPromise;
        }

        // 1. Add to Bloom Filter
        if (PredictiveCache.bloom) {
            PredictiveCache.bloom.add(key);
        }

        // 2. Determine TTL
        const currentCount = (PredictiveCache.accessCount.get(key) || 0) + 1;
        PredictiveCache.accessCount.set(key, currentCount);

        const ttl = explicitTtl || this.calculateAdaptiveTTL(currentCount);

        // 3. Update Memory (Tier 0)
        PredictiveCache.memCache.set(key, {
            data: value,
            expiry: Date.now() + (ttl * 1000)
        });

        // 4. Update KV (Tier 1)
        try {
            await this.env.PROJECT_CACHE.put(key, JSON.stringify(value), {
                expirationTtl: Math.max(60, ttl) // KV requires min 60s
            });

            // Advanced Research: Global Heat Signaling
            // If the item is "Hot", mark it in the global heat filter
            if (currentCount > 100 && PredictiveCache.bloom) {
                // We use a dedicated prefix for heat coordination
                const heatKey = `system:heat:${key}`;
                PredictiveCache.bloom.add(heatKey);
            }

            // Periodically persist Bloom Filter state (e.g. 1 in 10 writes to save bandwidth)
            if (Math.random() < 0.1) {
                const ctx = (this.env as any).ctx;
                await this.persistBloom(ctx);
            }
        } catch (e) {
            // Silently fail, Memory is primary for speed
        }
    }

    async delete(key: string): Promise<void> {
        PredictiveCache.memCache.delete(key);
        try {
            await this.env.PROJECT_CACHE.delete(key);
        } catch (e) {
            // Silently fail
        }
        // Note: Standard Bloom Filters cannot delete items. 
        // We accept the slight false positive rate increase until process restart.
    }

    private calculateAdaptiveTTL(accessCount: number): number {
        // 🚀 Moved to WASM for high-performance thresholding
        return AensEngine.calculate_adaptive_ttl(accessCount);
    }
}

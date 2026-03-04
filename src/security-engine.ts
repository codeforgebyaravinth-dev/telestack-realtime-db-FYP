import { Env } from './types';
// @ts-ignore
import initWasm, { SecurityEvaluator } from '../wasm-engine/pkg/wasm_engine';
// @ts-ignore
import wasmModule from '../wasm-engine/pkg/wasm_engine_bg.wasm';

interface SecurityRule {
    read?: string;
    write?: string;
    [key: string]: any;
}

export class SecurityEngine {
    private rules: any;
    private ruleCache = new Map<string, boolean>();
    private wasmInitPromise: Promise<void>;
    private wasmReady = false;

    constructor(rulesJson: string) {
        this.rules = JSON.parse(rulesJson);
        this.wasmInitPromise = initWasm(wasmModule).then(() => { this.wasmReady = true; });
    }

    async canRead(path: string, auth: any): Promise<boolean> {
        if (!this.wasmReady) await this.wasmInitPromise;

        const cacheKey = `r:${path}:${JSON.stringify(auth)}`;
        if (this.ruleCache.has(cacheKey)) {
            return this.ruleCache.get(cacheKey)!;
        }

        const result = this.evaluate('read', path, auth, null);
        this.ruleCache.set(cacheKey, result);
        return result;
    }

    async canWrite(path: string, auth: any, data: any): Promise<boolean> {
        if (!this.wasmReady) await this.wasmInitPromise;

        const cacheKey = `w:${path}:${JSON.stringify(auth)}`;
        if (this.ruleCache.has(cacheKey)) {
            return this.ruleCache.get(cacheKey)!;
        }

        const result = this.evaluate('write', path, auth, data);
        this.ruleCache.set(cacheKey, result);
        return result;
    }

    private evaluate(op: 'read' | 'write', path: string, auth: any, data: any): boolean {
        const segments = path.split('/').filter(s => s);
        let current = this.rules;

        // Traverse rule tree
        for (const seg of segments) {
            if (current[seg]) {
                current = current[seg];
            } else if (current['$wildcard']) {
                current = current['$wildcard'];
            } else {
                return false;
            }
        }

        const ruleString = current[op];
        if (!ruleString) return false;

        // Build context cleanly for WASM AST
        const contextJson = JSON.stringify({
            auth: auth || null,
            data: data || null
        });

        // 🚀 Evaluate via WebAssembly AST! No eval(), perfectly safe.
        // We now use depth-aware detection for advanced hierarchy research.
        const maxDepth = 10; // Research constraint
        return SecurityEvaluator.can_access_at_depth(ruleString, contextJson, segments.length, maxDepth);
    }
}

// Default rules for demo
export const DEFAULT_RULES = {
    users: {
        $wildcard: {
            read: 'auth != null',
            write: 'auth.uid == $wildcard'
        }
    },
    public: {
        read: 'true',
        write: 'auth != null'
    }
};

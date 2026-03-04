export interface Env {
    DB: D1Database;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            const { sql, params } = await request.json() as any;
            const startTime = Date.now();

            const res = await env.DB.prepare(sql).bind(...(params || [])).all();

            const executionTime = Date.now() - startTime;

            return new Response(JSON.stringify(res), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'X-Shadow-Latency': `${executionTime}ms`
                }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:8787';
const API_KEY = 'tsk_live_paint_demo_key_999';
const DOC_ID = 'demo_canvas_v1';
const WORKSPACE = 'paint-demo';

async function test() {
    console.log('--- Phase 1: Test GET (Immediate) ---');
    try {
        const res = await fetch(`${API_BASE}/paint/${DOC_ID}`, {
            headers: {
                'x-api-key': API_KEY,
                'x-workspace': WORKSPACE
            }
        });
        console.log(`GET Status: ${res.status}`);
        const body = await res.text();
        console.log(`GET Body: ${body.substring(0, 100)}...`);
    } catch (e) {
        console.error(`GET Error: ${e.message}`);
    }

    console.log('\n--- Phase 2: Test PATCH (Write) ---');
    const strokeId = 'test_' + Date.now();
    try {
        const res = await fetch(`${API_BASE}/paint/${DOC_ID}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-workspace': WORKSPACE
            },
            body: JSON.stringify({
                data: {
                    history: {
                        [strokeId]: { x1: 10, y1: 10, x2: 20, y2: 20, color: '#ff0000', size: 5 }
                    }
                }
            })
        });
        console.log(`PATCH Status: ${res.status}`);
        const body = await res.text();
        console.log(`PATCH Body: ${body}`);
    } catch (e) {
        console.error(`PATCH Error: ${e.message}`);
    }

    console.log('\n--- Phase 3: Wait for Flush (AENS) ---');
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n--- Phase 4: Test GET (Verify Persistence) ---');
    try {
        const res = await fetch(`${API_BASE}/paint/${DOC_ID}`, {
            headers: {
                'x-api-key': API_KEY,
                'x-workspace': WORKSPACE
            }
        });
        console.log(`GET Verify Status: ${res.status}`);
        const body = await res.text();
        console.log(`GET Verify Body: ${body.substring(0, 200)}...`);
    } catch (e) {
        console.error(`GET Verify Error: ${e.message}`);
    }
}

test();

import { Centrifuge } from 'https://esm.sh/centrifuge@5.5.3';

// ─── Config ─────────────────────────────────────────────────────────────────
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocal ? 'http://localhost:8787' : 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';

const API_KEY = 'tsk_live_paint_demo_key_999';
const DOC_ID = 'demo_canvas_v1';
const WORKSPACE = 'paint-demo';

// Centrifugo channel the worker publishes to after every PATCH
// Template: _ws_{workspace}_collection_{collection}
const CENTRIFUGO_CHANNEL = `_ws_${WORKSPACE}_collection_paint`;

// ─── Canvas Setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const sizePicker = document.getElementById('sizePicker');
const chaosBtn = document.getElementById('chaosBtn');
const chaosOverlay = document.getElementById('chaosOverlay');

let painting = false;
let color = '#3b82f6';
let size = 5;
let isChaos = false;
let chaosInterval = null;
let lastX = 0, lastY = 0;

// Track already-drawn stroke IDs to avoid double-rendering
let drawnStrokes = new Set();

// ─── Canvas Resize ───────────────────────────────────────────────────────────
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Full re-render on resize
    loadCanvasState(true);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ─── Drawing Logic ───────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => { painting = true; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener('mouseup', () => { painting = false; });
canvas.addEventListener('mousemove', e => {
    if (!painting) return;
    const x = e.clientX, y = e.clientY;
    renderStroke(lastX, lastY, x, y, color, size);
    syncStroke(lastX, lastY, x, y, color, size);
    lastX = x; lastY = y;
});

function renderStroke(x1, y1, x2, y2, strokeColor, strokeSize) {
    ctx.lineWidth = strokeSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// ─── Sync to Telestack (AENS PATCH) ─────────────────────────────────────────
async function syncStroke(x1, y1, x2, y2, strokeColor, strokeSize) {
    const timestamp = Date.now();
    const id = `${Math.random().toString(36).substr(2, 9)}_${timestamp}`;
    const stroke = { id, x1, y1, x2, y2, color: strokeColor, size: strokeSize, t: timestamp };
    drawnStrokes.add(id); // mark as locally drawn so we don't re-render it

    try {
        const res = await fetch(`${API_BASE}/paint/${DOC_ID}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-workspace': WORKSPACE
            },
            body: JSON.stringify({ data: { history: { [id]: stroke } } })
        });
        const data = await res.json();
        updateUIMetrics(data.metrics || {});
    } catch (e) {
        console.error('Sync Error:', e);
    }
}

// ─── Load Canvas State (initial load + fallback) ─────────────────────────────
async function loadCanvasState(forceRedraw = false) {
    try {
        const res = await fetch(`${API_BASE}/paint/${DOC_ID}`, {
            headers: { 'x-api-key': API_KEY, 'x-workspace': WORKSPACE }
        });
        if (res.status === 404) return; // fresh canvas
        const doc = await res.json();
        applyCanvasState(doc.data, forceRedraw);
    } catch (e) { /* silent fail */ }
}

function applyCanvasState(data, forceRedraw = false) {
    if (!data || !data.history) return;
    if (forceRedraw) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawnStrokes.clear();
    }
    Object.values(data.history).forEach(s => {
        if (!drawnStrokes.has(s.id)) {
            renderStroke(s.x1, s.y1, s.x2, s.y2, s.color, s.size);
            drawnStrokes.add(s.id);
        }
    });
}

// ─── Centrifugo Real-time Subscription ──────────────────────────────────────
let centrifuge = null;
let realtimeConnected = false;
let fallbackInterval = null;

async function initRealtime() {
    try {
        // Fetch WebSocket URL from worker (derived from CENTRIFUGO_API_URL)
        const cfg = await fetch(`${API_BASE}/centrifugo-config`).then(r => r.json());
        if (!cfg.wsUrl || cfg.wsUrl.startsWith('wss:///')) {
            throw new Error('No valid WebSocket URL configured');
        }

        centrifuge = new Centrifuge(cfg.wsUrl, {
            token: cfg.token || undefined
        });

        const sub = centrifuge.newSubscription(CENTRIFUGO_CHANNEL);

        sub.on('publication', ctx_pub => {
            // Worker publishes { type: 'CREATED'|'UPDATED', doc: { data: { history: {...} } } }
            const payload = ctx_pub.data;
            if (payload && payload.doc && payload.doc.data) {
                applyCanvasState(payload.doc.data);
            }
        });

        sub.on('subscribed', () => {
            console.log(`✅ Centrifugo: subscribed to ${CENTRIFUGO_CHANNEL}`);
            realtimeConnected = true;
            document.getElementById('syncMode').innerText = 'Centrifugo WebSocket';
            // Stop fallback polling now that we have real-time
            if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
        });

        sub.on('error', err => {
            console.warn('Centrifugo sub error, falling back to polling:', err);
            startFallbackPolling();
        });

        centrifuge.on('disconnected', () => {
            realtimeConnected = false;
            document.getElementById('syncMode').innerText = 'Polling (reconnecting…)';
            startFallbackPolling();
        });

        sub.subscribe();
        centrifuge.connect();

    } catch (e) {
        console.warn('Centrifugo init failed, falling back to polling:', e.message);
        startFallbackPolling();
    }
}

function startFallbackPolling() {
    if (fallbackInterval) return; // already polling
    document.getElementById('syncMode').innerText = 'Polling (500ms fallback)';
    fallbackInterval = setInterval(loadCanvasState, 500);
}

// ─── Metrics UI ──────────────────────────────────────────────────────────────
function updateUIMetrics(metrics) {
    if (metrics.aens) {
        document.getElementById('bufferWindow').innerText = `${Math.round(metrics.aens.lastThreshold)}ms`;
        document.getElementById('pvcSignal').innerText = metrics.aens.pvcSignal || 'SYNC-LOCKED';
        const velocity = metrics.aens.lastVelocity || 0;
        document.getElementById('velocityBar').style.width = `${Math.min(100, (velocity / 200) * 100)}%`;
    }
}

// ─── Chaos Mode ──────────────────────────────────────────────────────────────
chaosBtn.addEventListener('click', toggleChaos);

function toggleChaos() {
    isChaos = !isChaos;
    if (isChaos) {
        chaosBtn.innerText = 'Stop Chaos';
        chaosBtn.style.background = '#ef4444';
        chaosOverlay.classList.remove('hidden');
        let writesCount = 0;
        chaosInterval = setInterval(() => {
            const rx1 = Math.random() * canvas.width, ry1 = Math.random() * canvas.height;
            const rx2 = rx1 + (Math.random() * 50 - 25), ry2 = ry1 + (Math.random() * 50 - 25);
            const rColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
            renderStroke(rx1, ry1, rx2, ry2, rColor, 10);
            syncStroke(rx1, ry1, rx2, ry1, rColor, 10);
            writesCount++;
            document.getElementById('chaosWrites').innerText = `Writes: ${writesCount}`;
        }, 100);
    } else {
        chaosBtn.innerText = 'Chaos Mode';
        chaosBtn.style.background = '#3b82f6';
        chaosOverlay.classList.add('hidden');
        clearInterval(chaosInterval);
    }
}

// ─── Tool Events ─────────────────────────────────────────────────────────────
colorPicker.addEventListener('change', e => color = e.target.value);
sizePicker.addEventListener('input', e => size = e.target.value);

document.getElementById('clearBtn').addEventListener('click', async () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawnStrokes.clear();
    try {
        await fetch(`${API_BASE}/paint/${DOC_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'x-workspace': WORKSPACE },
            body: JSON.stringify({ data: { history: {} }, userId: 'admin' })
        });
    } catch (e) { }
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// 1. Load existing canvas state immediately
loadCanvasState();

// 2. Connect to Centrifugo for real-time updates (falls back to polling if unavailable)
initRealtime();

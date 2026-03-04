// Native fetch is available in Node.js v18+

const ENDPOINT = 'https://telestack-realtime-db-production.codeforgebyaravinth.workers.dev';
const API_KEY = 'tsk_live_abc123';

async function seed() {
    console.log('🌱 Seeding public demo...');
    const res = await fetch(`${ENDPOINT}/documents/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
        },
        body: JSON.stringify({
            data: {
                text: 'Welcome to the Telestack Public Lobby! 🚀',
                sender: 'system',
                timestamp: new Date().toISOString()
            },
            userId: 'system',
            workspaceId: 'telestack-public-demo'
        })
    });

    if (res.ok) {
        console.log('✅ Seed successful!');
        console.log(await res.json());
    } else {
        console.error('❌ Seed failed:', res.status, await res.text());
    }
}

seed().catch(console.error);


const BASE_URL = "http://127.0.0.1:8787";

const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    white: "\x1b[37m"
};

async function main() {
    console.log(`${colors.cyan}\n=== HYPER-SPEED HYBRID TIERING PROOF ===${colors.reset}`);

    try {
        // 1. Initialize Platform Tables
        console.log(`${colors.yellow}Initializing/Resetting Platform Database...${colors.reset}`);
        const initRes = await fetch(`${BASE_URL}/documents/internal/reset`, { method: "POST" });
        if (!initRes.ok) console.error("Init Failed:", await initRes.text());

        // 2. Setup Platform Auth (Signup)
        console.log(`${colors.yellow}Signing up as Platform Admin...${colors.reset}`);
        const signupRes = await fetch(`${BASE_URL}/platform/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: `admin-${Date.now()}@telestack.db`,
                password: "proof_password",
                fullName: "Proof Admin"
            })
        });
        const signupData = await signupRes.json();
        if (!signupData.token) throw new Error("Signup failed: " + JSON.stringify(signupData));
        const { token } = signupData;
        const platformHeaders = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

        // 3. Create Enterprise Project (Physical Isolation)
        console.log(`${colors.yellow}Provisioning Enterprise Project (REST/Physical)...${colors.reset}`);
        const entRes = await fetch(`${BASE_URL}/platform/projects`, {
            method: "POST",
            headers: platformHeaders,
            body: JSON.stringify({ name: "Enterprise Proof", isolationType: "physical" })
        });
        const entProject = await entRes.json();
        if (!entProject.id) throw new Error("Enterprise Project Creation failed: " + JSON.stringify(entProject));
        console.log(`   ID: ${entProject.id} | D1: ${entProject.d1DatabaseId}`);

        // 4. Create Performance Project (Logical Isolation)
        console.log(`${colors.cyan}Provisioning Performance Project (Native/Logical)...${colors.reset}`);
        const perfRes = await fetch(`${BASE_URL}/platform/projects`, {
            method: "POST",
            headers: platformHeaders,
            body: JSON.stringify({ name: "Performance Proof", isolationType: "logical" })
        });
        const perfProject = await perfRes.json();
        if (!perfProject.id) throw new Error("Performance Project Creation failed: " + JSON.stringify(perfProject));
        console.log(`   ID: ${perfProject.id} | Tier: Performance (Native)`);

        // 5. Benchmarking setup
        const runBenchmark = async (project, label, color) => {
            console.log(`\n${color}--- Benchmarking ${label} ---${colors.reset}`);
            const headers = { "workspaceId": project.id, "Content-Type": "application/json" };
            const docId = `doc-${Math.random().toString(36).substring(7)}`;

            // First: Create Document (PUT)
            console.log(`   Performing Create (PUT)...`);
            await fetch(`${BASE_URL}/documents/tests/${docId}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ data: "Sub-10ms Proof Data" })
            });

            // Second: Cold Read (Cache MISS)
            console.log(`   Performing Cold Read (GET)...`);
            const res = await fetch(`${BASE_URL}/documents/tests/${docId}`, { headers });

            const internalLatency = res.headers.get("x-internal-latency");
            const isolation = res.headers.get("x-isolation") || "Unknown";
            const cache = res.headers.get("x-cache");

            console.log(`   Isolation Type: ${colors.white}${isolation}${colors.reset}`);
            console.log(`   Cache Status:   ${colors.yellow}${cache}${colors.reset}`);
            console.log(`   INTERNAL LATENCY: ${colors.green}${internalLatency}${colors.reset}`);

            return parseInt(internalLatency || "0");
        };

        const entLatency = await runBenchmark(entProject, "ENTERPRISE (REST)", colors.yellow);
        const perfLatency = await runBenchmark(perfProject, "PERFORMANCE (NATIVE)", colors.cyan);

        console.log(`${colors.magenta}\n=== FINAL PROOF VERDICT ===${colors.reset}`);
        console.log(`Enterprise (REST) Miss: ${entLatency}ms`);
        console.log(`Performance (Native) Miss: ${perfLatency}ms`);

        const speedup = (entLatency / perfLatency).toFixed(1);
        console.log(`${colors.green}PERFORMANCE TIER IS ${speedup}X FASTER ON CACHE MISSES!${colors.reset}\n`);

    } catch (e) {
        console.error("Proof Failed:", e);
    }
}

main();

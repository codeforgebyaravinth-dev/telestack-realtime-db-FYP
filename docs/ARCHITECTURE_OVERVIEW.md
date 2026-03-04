# Architecture & System Design

## 1. 🏗️ The Quad-Layer Hybrid Architecture

![Telestack Global Architecture](file:///c:/Users/garag/OneDrive/Desktop/TelestackDB/TelestackrealtimeDB/docs/assets/architecture_v1.png)

Telestack RealtimeDB is designed as a multi-layered distributed bridge between **the Edge** (Cloudflare Workers) and **Durable Storage** (D1 Database).

---

## 2. 🏛️ Structural Components

### A. Global Edge Router
*   **Role**: Entry Point & Geo-Targeting.
*   **Design**: A specialized Worker that detects the user's nearest data center and proxies the request to the regional worker instance while maintaining session affinity.

### B. The Telestack Worker (The Core)
The Worker is a high-speed runtime environment that orchestrates three main sub-engines:
1.  **Wasm Security Engine**: Authorization in **<1ms**.
2.  **Predictive Cache**: Edge-native memory for hot reads.
3.  **Write Buffer (AENS)**: Coalesced batching for 100% write reliability.

### C. D1 Database Shards (The Persistence)
*   **Role**: Durable Storage.
*   **Design**: A cluster of SQLite-based D1 databases. The Worker uses a **Workspace Mapping** strategy to distribute data across multiple shards, preventing single-database bottlenecks.

### D. Centrifugo Pub/Sub (The Realtime Layer)
*   **Role**: State Synchronization.
*   **Design**: A specialized pub/sub server (Centrifugo) that broadcasts state changes from the Worker to millions of connected clients in **<50ms**.

---

## 3. 🔄 Complete Request Lifecycle

```mermaid
sequenceDiagram
    participant U as 🌍 User
    participant R as ⚡ Global Router
    participant W as 🛠️ Edge Worker
    participant C as 🧠 Predictive Cache
    participant A as 🚀 AENS Buffer
    participant D as 💾 Durable D1
    participant S as 📡 Realtime Pub/Sub

    U->>R: Ingress (PATCH /doc/1)
    R->>W: Proxy to Nearest Region
    W->>W: Wasm Security Check (<1ms)
    W->>A: Queue Write & Calc Threshold
    A->>W: Confirm Accepted (Ack)
    W->>U: HTTP 202 Accepted (<2ms)
    
    Note over A,D: Coalescing Round (T-ms)
    
    A->>D: Commit Synthesized State
    D->>A: Commit Success
    A->>S: Broadcast Sync Signal
    S-->>U: Webhook/WS Update (<50ms)
```

---

## 4. 🛡️ Fault Tolerance & Durability
1.  **Edge-to-D1 Mirroring**: The database always contains the "Sequence of Truth."
2.  **Global KV Snapshotting**: Every 30 minutes, the system performs a non-blocking snapshot of active documents from D1 to Cloudflare KV for disaster recovery and cross-region migration.

---
**🏆 Project Highlight**: This architecture proves that "Distributed Consistency" and "Edge Performance" are no longer mutually exclusive.

# Visual System Architecture & Design Gallery

This document provides a multi-level visual breakdown of the **Telestack RealtimeDB** architecture, from global ingress down to bit-level Wasm operations.

## 🖼️ High-Fidelity Architectural Overview

![Telestack Global Architecture](file:///c:/Users/garag/OneDrive/Desktop/TelestackDB/TelestackrealtimeDB/docs/assets/architecture_v1.png)

---

## 🚀 The AENS Synthesis Engine (Core Invention)

![AENS Synthesis Engine Visualization](file:///c:/Users/garag/OneDrive/Desktop/TelestackDB/TelestackrealtimeDB/docs/assets/aens_engine_v1.png)

---

## 1. 🌍 System Context (Level 1)
Shows how Telestack interacts with external actors and systems.

```mermaid
graph LR
    User["🌍 Global User (Web/Mobile)"] -- "HTTPS / JSON / PATCH" --> Telestack["💎 Telestack RealtimeDB System"]
    Telestack -- "Broadcast State" --> Centrifugo["📡 Centrifugo (Pub/Sub)"]
    Telestack -- "Durable Commit" --> D1["💾 Cloudflare D1 (SQL)"]
    Telestack -- "Snapshot" --> KV["📦 Cloudflare KV (Global Backing)"]
```

---

## 2. 🏗️ Container Diagram (Level 2)
Zooming into the Cloudflare platform ecosystem.

```mermaid
graph TD
    subgraph "Cloudflare Global Network"
        Router["⚡ Global Edge Router (Worker)"]
        
        subgraph "Regional Edge Node (Nearest Colo)"
            Worker["🛠️ Telestack Worker (Runtime)"]
            Wasm["🧠 Wasm Engine (Rust Core)"]
            Cache["💾 Local L1 Cache (Memory)"]
        end
        
        KV_Store["📦 Global KV Store"]
    end
    
    subgraph "Durable Storage Layer"
        D1_Shard1["💾 D1: Shard A (US-East)"]
        D1_Shard2["💾 D1: Shard B (EU-West)"]
    end

    User --> Router
    Router -->|Proxy| Worker
    Worker --> Wasm
    Worker --> Cache
    Worker --> KV_Store
    Worker --> D1_Shard1
    Worker --> D1_Shard2
```

---

## 3. 🧠 Component Diagram: The Wasm Core (Level 3)
Zooming into the "Brain" of the system.

```mermaid
graph TD
    subgraph "Wasm-Engine (Rust/Wasm)"
        Sec["🛡️ Security Evaluator"]
        Bloom["🔍 Bloom Filter Engine"]
        AENS["🚀 AENS Synthesis Engine"]
        CRDT["🧬 JSON CRDT Merger"]
    end
    
    Request["📥 Incoming Request"] --> Sec
    Sec -->|Authorized| Bloom
    Bloom -->|Existence Check| AENS
    AENS -->|Coalesce| CRDT
    CRDT -->|Synthesized State| Response["📤 Durable Write"]
```

---

## 4. 🔄 Data Flow: The Write-Synthesis Path
Visualizing the AENS v2.0 lifecycle.

```mermaid
stateDiagram-v2
    [*] --> Ingress: User PATCH
    Ingress --> Security: Wasm Auth Check
    Security --> WriteBuffer: Accepted (202 Ack)
    
    state WriteBuffer {
        [*] --> Accumulate
        Accumulate --> VelocityCheck: Velocity (v) > 1
        VelocityCheck --> CalculateThreshold: Solve T = f(v, P, Q)
        CalculateThreshold --> Wait: Wait T-ms
    }
    
    Wait --> WasmSynthesizer: Threshold Reached
    WasmSynthesizer --> CRDTMerge: Deep JSON Synthesis
    CRDTMerge --> D1Gateway: Atomic Batch Commit
    D1Gateway --> [*]: Success
```

---

## 5. 💾 Persistence & Durability Architecture
How the system ensures no data is ever lost.

```mermaid
graph TD
    subgraph "Tier 1: Hot (Edge Memory)"
        L1["Local Memory Cache"]
    end
    
    subgraph "Tier 2: Warm (D1 Database)"
        D1["D1 SQLite Shards"]
    end
    
    subgraph "Tier 3: Cold (Global KV)"
        KV["Global Snapshot Store"]
    end

    L1 -- "AENS Sync" --> D1
    D1 -- "Cron Trigger (30m)" --> KV
    KV -- "Restore/Pre-warm" --> L1
```

---
**🏆 Project Highlight**: This visual design eliminates the "Distance Barrier" by ensuring that critical logic (Security & Synthesis) always happens within 1-2ms of the user.

# Syscrack Executable Whiteboard: Complete Frontend-Backend Design Document

## Executive Summary

This document defines the complete architecture for Syscrack's **Executable Whiteboard** - a systems design practice platform that combines Excalidraw's authentic whiteboard experience with executable system simulation and automated grading.

**Core Innovation:** "Draw your architecture naturally, then prove it works"

---

## I. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React/Next.js)                    │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │  Excalidraw  │  │   Component   │  │   Component Inspector    │  │
│  │   Canvas     │  │   Palette     │  │   (Config Panel)         │  │
│  │  (embedded)  │  │   (overlay)   │  │                          │  │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │    Scene     │  │  Simulation   │  │   Results Panel          │  │
│  │   Parser     │  │   Trigger     │  │   (Slide-up)             │  │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ REST API + WebSocket
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Python/FastAPI)                    │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │   Design     │  │  Simulation   │  │     Grading Engine       │  │
│  │   Parser     │  │    Engine     │  │                          │  │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │   Traffic    │  │   Component   │  │     Metrics Collector    │  │
│  │  Generator   │  │    Models     │  │                          │  │
│  └──────────────┘  └───────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER (PostgreSQL)                     │
│    system_designs │ design_components │ simulation_results │ users  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## II. Frontend Architecture

### 2.1 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14 (React) | SSR, routing, API routes |
| Canvas | @excalidraw/excalidraw | Hand-drawn whiteboard experience |
| State | Zustand or Context | Component selection, configs |
| Styling | Tailwind CSS | Rapid UI development |
| API | React Query | Data fetching, caching |
| WebSocket | Socket.io-client | Real-time simulation updates |

### 2.2 Excalidraw Integration

**Package:** `@excalidraw/excalidraw`

```tsx
import { Excalidraw } from "@excalidraw/excalidraw";

function SystemDesignCanvas() {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);

  return (
    <div className="relative w-full h-screen">
      {/* Excalidraw Canvas */}
      <Excalidraw
        ref={(api) => setExcalidrawAPI(api)}
        onChange={(elements) => handleSceneChange(elements)}
        onPointerUpdate={(payload) => handleSelection(payload)}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveAsImage: false
          }
        }}
        initialData={{
          appState: {
            viewBackgroundColor: "#f8f9fa",
            currentItemRoughness: 1, // Sketchy hand-drawn style
          }
        }}
      />
      
      {/* Component Palette - Floating Left */}
      <ComponentPalette
        className="absolute left-4 top-20"
        onDragComponent={(type) => addComponentToCanvas(type)}
      />
      
      {/* Component Inspector - Floating Right */}
      {selectedComponent && (
        <ComponentInspector
          className="absolute right-4 top-20"
          component={selectedComponent}
          onUpdate={(config) => updateComponentConfig(config)}
        />
      )}
      
      {/* Run Simulation Button */}
      <button
        className="absolute right-4 top-4 bg-blue-600 text-white px-4 py-2"
        onClick={runSimulation}
      >
        Run Simulation ▶
      </button>
    </div>
  );
}
```

### 2.3 Component Representation

**Strategy:** Use Excalidraw's `customData` field to mark elements as system components.

```typescript
interface SystemComponentElement extends ExcalidrawElement {
  customData: {
    isSystemComponent: true;
    componentType: ComponentType;
    componentConfig: ComponentConfig;
  };
}

interface SystemConnectionElement extends ExcalidrawElement {
  type: "arrow";
  startBinding: { elementId: string };
  endBinding: { elementId: string };
  customData: {
    isSystemConnection: true;
    protocol: "http" | "grpc" | "message_queue";
    throughput_qps: number;
    data_contract: DataContract;
  };
}
```

### 2.4 Component Palette

```tsx
const COMPONENT_TEMPLATES = [
  { type: "client", label: "Client", icon: "🌐", color: "#868e96" },
  { type: "load_balancer", label: "Load Balancer", icon: "⚖️", color: "#1971c2" },
  { type: "app_server", label: "App Server", icon: "🖥️", color: "#7950f2" },
  { type: "database", label: "Database", icon: "💾", color: "#2f9e44" },
  { type: "cache", label: "Cache", icon: "⚡", color: "#f59f00" },
  { type: "message_queue", label: "Message Queue", icon: "📮", color: "#e03131" },
  { type: "cdn", label: "CDN", icon: "🌍", color: "#1098ad" },
  { type: "object_storage", label: "Object Storage", icon: "🗄️", color: "#5f3dc4" },
];
```

### 2.5 Scene Parser

```typescript
interface SystemDesign {
  components: Component[];
  connections: Connection[];
}

function parseExcalidrawScene(elements: ExcalidrawElement[]): SystemDesign {
  const components: Component[] = [];
  const connections: Connection[] = [];
  
  for (const element of elements) {
    if (element.customData?.isSystemComponent) {
      components.push({
        id: element.id,
        type: element.customData.componentType,
        name: extractComponentName(element),
        config: element.customData.componentConfig,
        position: { x: element.x, y: element.y }
      });
    }
    
    if (element.type === "arrow" && element.customData?.isSystemConnection) {
      connections.push({
        id: element.id,
        source_id: element.startBinding.elementId,
        target_id: element.endBinding.elementId,
        protocol: element.customData.protocol,
        throughput_qps: element.customData.throughput_qps,
        data_contract: element.customData.data_contract
      });
    }
  }
  
  return { components, connections };
}
```

---

## III. Backend Architecture

### 3.1 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | FastAPI (Python) | Async API, WebSocket support |
| Graph | NetworkX | Graph representation, traversal |
| Database | PostgreSQL + SQLAlchemy | Data persistence |
| Queue | Celery + Redis | Async simulation jobs |
| WebSocket | FastAPI WebSockets | Real-time updates |

### 3.2 Data Models

```python
from dataclasses import dataclass
from enum import Enum
from typing import Optional
from datetime import datetime

class ComponentType(Enum):
    LOAD_BALANCER = "load_balancer"
    WEB_SERVER = "web_server"
    APP_SERVER = "app_server"
    DATABASE = "database"
    CACHE = "cache"
    MESSAGE_QUEUE = "message_queue"
    CDN = "cdn"
    OBJECT_STORAGE = "object_storage"
    SEARCH_INDEX = "search_index"

@dataclass
class Component:
    id: str
    type: ComponentType
    name: str
    config: dict
    position: dict  # {x: int, y: int}

@dataclass
class Connection:
    id: str
    source_id: str
    target_id: str
    protocol: str
    data_contract: dict
    throughput_qps: int

@dataclass
class SystemDesign:
    id: int
    problem_id: int
    user_id: str
    canvas_data: dict
    components: list[Component]
    connections: list[Connection]
    created_at: datetime
    updated_at: datetime

@dataclass
class SimulationResult:
    design_id: int
    scenario: str
    metrics: "SimulationMetrics"
    passed: bool
    feedback: list[str]
    score: int

@dataclass
class SimulationMetrics:
    throughput_qps: int
    avg_latency_ms: float
    p99_latency_ms: float
    error_rate: float
    estimated_cost_monthly: float
    single_points_of_failure: list[str]
    bottlenecks: list[str]
```

### 3.3 Component Capacity Models

Each component has: **type variations**, **capacity**, **latency**, **cost**, **requirements it satisfies**, and **failure behavior**.

---

#### Load Balancer

```python
@dataclass
class LoadBalancerConfig:
    layer: str = "L7"  # L4 (TCP) | L7 (HTTP)
    algorithm: str = "round_robin"  # round_robin | least_connections | ip_hash
    ssl_termination: bool = True
    health_check_type: str = "http"  # tcp | http
    max_connections: int = 10000
    sticky_sessions: bool = False  # Required if app servers are stateful
```

**Performance by Configuration:**

| Config | Impact |
|--------|--------|
| L4 (TCP) | +50% throughput, but no URL routing |
| L7 (HTTP) | URL-based routing, +5ms latency |
| SSL at LB | Offloads apps, but LB can bottleneck |
| Sticky sessions | Required for stateful apps, reduces distribution efficiency |

**Base Metrics:** 10,000 QPS | +2ms latency | $50/month

---

#### Database

```python
@dataclass
class DatabaseConfig:
    type: str = "relational"  # relational | nosql | search | timeseries
    engine: str = "postgres"  # postgres | mysql | mongodb | elasticsearch | cassandra | timescaledb
    instance_type: str = "db.m5.large"
    storage_gb: int = 100
    read_replicas: int = 0
    sharding: bool = False
    replication_mode: str = "async"  # sync | async (sync = no data loss, slower writes)
    connection_pooling: bool = True
```

**Database Types & Performance:**

| Type | Engine | Write QPS | Read QPS | Latency | Cost | Capabilities |
|------|--------|-----------|----------|---------|------|--------------|
| **Relational** | PostgreSQL | 1,000 | 5,000/replica | 10ms R, 50ms W | $500 | ACID ✅, JOINs ✅, Transactions ✅ |
| **Relational** | MySQL | 800 | 4,000/replica | 12ms R, 60ms W | $400 | ACID ✅, JOINs ✅, Transactions ✅ |
| **NoSQL** | MongoDB | 10,000 | 50,000 | 5ms | $600 | Flexible schema, horizontal scale |
| **NoSQL** | Cassandra | 50,000 | 100,000 | 3ms | $800 | Extreme write throughput |
| **Search** | Elasticsearch | 500 | 100,000 | 20ms | $800 | Full-text search ✅, aggregations |
| **TimeSeries** | TimescaleDB | 100,000 | 50,000 | 5ms | $500 | Time-based queries ✅, downsampling |

**Problem-Requirement Matching:**

```python
REQUIREMENT_PENALTIES = {
    "transactions": {
        "mongodb": {"latency_multiplier": 3.0, "message": "Multi-doc transactions 3x slower"},
        "cassandra": {"fail": True, "message": "Cassandra doesn't support ACID transactions"}
    },
    "complex_queries": {
        "mongodb": {"latency_multiplier": 5.0, "message": "No JOINs - requires multiple queries"},
        "cassandra": {"latency_multiplier": 10.0, "message": "Limited query flexibility"}
    },
    "full_text_search": {
        "postgres": {"latency_multiplier": 5.0, "message": "Use Elasticsearch for search workloads"},
        "mysql": {"latency_multiplier": 5.0, "message": "Use Elasticsearch for search workloads"}
    },
    "strong_consistency": {
        "mongodb": {"warning": "Configure read/write concern for strong consistency"},
        "cassandra": {"warning": "Tune consistency level (QUORUM+)"}
    }
}
```

---

#### Cache

```python
@dataclass
class CacheConfig:
    type: str = "redis"  # redis | memcached
    memory_gb: int = 16
    eviction_policy: str = "lru"  # lru | lfu | ttl
    persistence: bool = False
    cluster_mode: bool = False
    write_strategy: str = "cache_aside"  # cache_aside | write_through | write_back
```

**Cache Types & Performance:**

| Type | Throughput | Latency | Best For |
|------|------------|---------|----------|
| **Redis** | 100,000 QPS | 1ms | Complex data structures, pub/sub, leaderboards |
| **Memcached** | 200,000 QPS | 0.5ms | Simple key-value, session storage |

**Write Strategy Impact:**

| Strategy | Consistency | Write Latency | Use Case |
|----------|-------------|---------------|----------|
| Cache-aside | Eventually consistent | Fast (cache only) | Read-heavy, stale OK |
| Write-through | Strong | Slow (cache + DB) | Consistency critical |
| Write-back | Eventually consistent | Fast | Write-heavy, loss OK |

**Base Metrics:** 100K QPS | 1ms | $12.50/GB | 90% hit rate assumed

> **Future Enhancement:** Model cache invalidation strategies (TTL vs event-based)

---

#### Message Queue

```python
@dataclass
class MessageQueueConfig:
    type: str = "kafka"  # kafka | rabbitmq | sqs
    partitions: int = 10
    replication_factor: int = 3
    delivery_guarantee: str = "at_least_once"  # at_most_once | at_least_once | exactly_once
    ordering: str = "partition"  # none | partition | global
    retention_hours: int = 168
```

**Queue Types & Performance:**

| Type | Throughput | Latency | Ordering | Best For |
|------|------------|---------|----------|----------|
| **Kafka** | 500,000 msg/s | 5ms | Partition-level | Streaming, event sourcing, replay |
| **RabbitMQ** | 50,000 msg/s | 1ms | Queue-level | Task queues, complex routing |
| **SQS** | 3,000 msg/s | 20ms | FIFO optional | Serverless, simple queues |

**Delivery Guarantee Impact:**

| Guarantee | Throughput Multiplier | Use Case |
|-----------|----------------------|----------|
| At-most-once | 1.0x (fastest) | Logs, metrics (loss OK) |
| At-least-once | 0.8x | Most applications (idempotent handlers) |
| Exactly-once | 0.1x (10x slower) | Financial transactions |

**Problem-Requirement Matching:**

```python
QUEUE_REQUIREMENTS = {
    "exactly_once_delivery": {
        "sqs_standard": {"fail": True, "message": "SQS Standard doesn't guarantee ordering/exactly-once"},
        "kafka": {"latency_multiplier": 10.0, "message": "Exactly-once requires transactions"}
    },
    "global_ordering": {
        "kafka": {"throughput_multiplier": 0.1, "message": "Single partition limits parallelism"},
        "sqs_standard": {"fail": True, "message": "Use SQS FIFO for ordering"}
    }
}
```

---

#### App Server

```python
@dataclass
class AppServerConfig:
    runtime: str = "python"  # python | go | java | nodejs
    instances: int = 3
    cpu_cores: int = 2
    memory_gb: int = 4
    stateless: bool = True
    connection_pooling: bool = True
    concurrency_model: str = "async"  # sync | async
```

**Runtime Performance:**

| Runtime | QPS/Instance | Memory | Cold Start | Best For |
|---------|--------------|--------|------------|----------|
| **Go** | 2,000 | 50MB | 10ms | High-throughput APIs |
| **Node.js** | 500 | 100MB | 100ms | I/O-bound, real-time |
| **Java** | 1,000 | 500MB | 2,000ms | Enterprise, complex logic |
| **Python** | 200 | 150MB | 500ms | ML workloads, rapid dev |

**Concurrency Model Impact:**

| Model | QPS Multiplier | Best For |
|-------|---------------|----------|
| Sync (threads) | 1.0x | CPU-bound work |
| Async (event loop) | 3.0x | I/O-bound (DB calls, APIs) |

**Grading Penalty:**

```python
if not config.stateless:
    feedback.append("⚠️ Stateful servers prevent horizontal scaling")
    scalability_score -= 10

if not config.connection_pooling:
    feedback.append("⚠️ Without connection pooling, DB connections exhaust under load")
    # Simulate connection exhaustion at high load
```

---

#### CDN

```python
@dataclass
class CDNConfig:
    provider: str = "cloudflare"  # cloudflare | cloudfront | fastly
    edge_locations: int = 200
    cache_ttl_sec: int = 3600
    dynamic_content: bool = False  # Edge computing for dynamic content
    origin_shield: bool = False    # Reduces origin requests
```

**Performance:**

| Config | Impact |
|--------|--------|
| Static only | 95% cache hit, 20ms latency |
| Dynamic (edge compute) | 70% cache hit, 50ms latency, reduces origin load |
| Origin shield | +10ms latency, but 50% fewer origin requests |

**Base Metrics:** Unlimited throughput | 20ms | $0.08/GB

> **Future Enhancement:** Model cache invalidation (purge API vs versioned URLs)

---

#### Object Storage

```python
@dataclass
class ObjectStorageConfig:
    provider: str = "s3"  # s3 | gcs | azure_blob
    storage_class: str = "standard"  # standard | infrequent | archive
    replication: str = "single_region"  # single_region | multi_region
    transfer_acceleration: bool = False
```

**Storage Class Impact:**

| Class | GET/s | PUT/s | Latency | Cost/GB | Access Pattern |
|-------|-------|-------|---------|---------|----------------|
| Standard | 5,500 | 3,500 | 100ms | $0.023 | Frequent access |
| Infrequent | 1,000 | 500 | 200ms | $0.0125 | Monthly access |
| Archive | 10 | 1 | hours | $0.004 | Yearly access |

**Base Metrics:** 5,500 GET/s | 100ms | $0.023/GB

---

#### Summary Table: All Components

| Component | Types/Variants | Key Tradeoff |
|-----------|---------------|--------------|
| Load Balancer | L4/L7, algorithms | Throughput vs routing flexibility |
| Database | Relational/NoSQL/Search/TimeSeries | Consistency vs throughput |
| Cache | Redis/Memcached | Features vs raw speed |
| Message Queue | Kafka/RabbitMQ/SQS | Throughput vs guarantees |
| App Server | Go/Java/Python/Node | Performance vs dev speed |
| CDN | Static/Dynamic | Cache hit rate vs freshness |
| Object Storage | Standard/Infrequent/Archive | Cost vs access speed |

---

## IV. Simulation Engine

### 4.1 Execution Flow

```
1. User submits design (canvas + config)
   ▼
2. Design Validator checks for basic issues
   - Are all components connected?
   - Is there a client entry point?
   - Are orphaned components present?
   ▼
3. Scenario Runner generates traffic
   - Normal load: 1,000 QPS
   - Peak load: 10,000 QPS
   - Failure: Random component fails
   ▼
4. Component Models calculate metrics
   - Each component processes requests
   - Track latency, throughput, errors
   - Identify bottlenecks
   ▼
5. Grading Engine evaluates design
   ▼
6. Return feedback to user
```

### 4.2 Graph Building (NetworkX)

```python
import networkx as nx

def build_execution_graph(components: list[Component], 
                          connections: list[Connection]) -> nx.DiGraph:
    G = nx.DiGraph()
    
    for comp in components:
        G.add_node(
            comp.id,
            type=comp.type,
            config=comp.config,
            instance=create_component_instance(comp)
        )
    
    for conn in connections:
        G.add_edge(
            conn.source_id,
            conn.target_id,
            protocol=conn.protocol,
            throughput_qps=conn.throughput_qps
        )
    
    return G
```

### 4.3 Request Processing

```python
@dataclass
class Request:
    id: str
    arrival_time: float
    type: str  # "read" or "write"
    size_bytes: int

@dataclass
class RequestResult:
    request_id: str
    success: bool
    total_latency_ms: float
    path: list[str]
    bottleneck: Optional[str] = None

def process_request(G: nx.DiGraph, entry_point: str, request: Request) -> RequestResult:
    current_node = entry_point
    total_latency = 0.0
    path = []
    
    while current_node:
        path.append(current_node)
        component = G.nodes[current_node]['instance']
        
        if not component.can_handle(request):
            return RequestResult(
                request_id=request.id,
                success=False,
                total_latency_ms=total_latency,
                path=path,
                bottleneck=current_node
            )
        
        latency = component.process(request)
        total_latency += latency
        
        downstream = list(G.successors(current_node))
        if not downstream:
            break
        current_node = downstream[0]
    
    return RequestResult(
        request_id=request.id,
        success=True,
        total_latency_ms=total_latency,
        path=path
    )
```

---

## V. Grading Rubric (100 Points)

### 5.1 Functional Correctness (40 points)

| Criteria | Points | Validation |
|----------|--------|------------|
| Handles required QPS | 15 | Error rate < 0.1% |
| Meets latency SLA | 10 | P99 < requirement |
| Data consistency | 10 | Has database, proper write path |
| Handles all API endpoints | 5 | All operations implemented |

### 5.2 Scalability (25 points)

| Criteria | Points | Validation |
|----------|--------|------------|
| Horizontal scaling | 10 | Stateless app servers |
| No single point of failure | 10 | Redundant critical components |
| Caching strategy | 5 | Has cache layer |

### 5.3 Availability & Resilience (20 points)

| Criteria | Points | Validation |
|----------|--------|------------|
| Graceful degradation | 10 | Survives 1 component failure |
| Data durability | 5 | DB has backups, replication |
| Monitoring & alerting | 5 | Has monitoring component |

### 5.4 Cost Efficiency (15 points)

| Criteria | Points | Validation |
|----------|--------|------------|
| Reasonable cost | 10 | Within 2x of optimal |
| Resource utilization | 5 | Not over-provisioned |

### 5.5 Scoring Tiers

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | Excellent | Production-ready, hire at L6+ |
| 75-89 | Good | Would pass interview |
| 60-74 | Acceptable | Basic understanding |
| 40-59 | Weak | Major flaws |
| 0-39 | Poor | Fundamental misunderstanding |

---

## VI. API Contracts

### 6.1 Design Management

#### POST /designs
Create new design.

**Request:**
```json
{
  "problem_id": 1,
  "canvas_data": {
    "components": [...],
    "connections": [...]
  }
}
```

**Response:** `201 Created`
```json
{
  "id": 42,
  "problem_id": 1,
  "user_id": "550e8400...",
  "created_at": "2024-01-15T10:00:00Z"
}
```

#### PUT /designs/{id}
Update existing design.

#### GET /designs/{id}
Get design details.

### 6.2 Validation & Simulation

#### POST /designs/{id}/validate

**Response:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["No caching layer detected"]
}
```

#### POST /designs/{id}/simulate

**Request:**
```json
{
  "scenarios": ["normal_load", "peak_load", "db_failure"]
}
```

**Response:** `202 Accepted`
```json
{
  "job_id": "sim_xyz123",
  "status": "running",
  "estimated_time_sec": 30
}
```

#### GET /simulations/{job_id}

**Response (completed):**
```json
{
  "job_id": "sim_xyz123",
  "status": "completed",
  "results": [
    {
      "scenario": "normal_load",
      "passed": true,
      "score": 38,
      "metrics": {
        "throughput_qps": 10000,
        "p99_latency_ms": 85,
        "error_rate": 0.001,
        "estimated_cost_monthly": 2500
      },
      "feedback": ["✓ No bottlenecks detected"]
    }
  ],
  "total_score": 53
}
```

---

## VII. Database Schema

```sql
CREATE TABLE system_designs (
    id SERIAL PRIMARY KEY,
    problem_id INTEGER REFERENCES problems(id),
    user_id UUID REFERENCES users(id),
    canvas_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE design_components (
    id UUID PRIMARY KEY,
    design_id INTEGER REFERENCES system_designs(id),
    type VARCHAR(50),
    name VARCHAR(100),
    config JSONB,
    position JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE design_connections (
    id UUID PRIMARY KEY,
    design_id INTEGER REFERENCES system_designs(id),
    source_id UUID REFERENCES design_components(id),
    target_id UUID REFERENCES design_components(id),
    protocol VARCHAR(50),
    data_contract JSONB,
    throughput_qps INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE simulation_results (
    id SERIAL PRIMARY KEY,
    design_id INTEGER REFERENCES system_designs(id),
    scenario VARCHAR(100),
    metrics JSONB,
    score INTEGER,
    feedback JSONB,
    passed BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## VIII. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

| Week | Frontend Tasks | Backend Tasks |
|------|----------------|---------------|
| 1-2 | Excalidraw setup, Component palette | API endpoints, Design validator |
| 3-4 | Component inspector, Connection config | Component models, Graph builder |

### Phase 2: Simulation (Weeks 5-8)

| Week | Frontend Tasks | Backend Tasks |
|------|----------------|---------------|
| 5-6 | Scene parser, API integration | Simulation engine core, Traffic generator |
| 7-8 | Results panel, WebSocket | Grading engine, Failure injection |

### Phase 3: Polish (Weeks 9-12)

| Week | Frontend Tasks | Backend Tasks |
|------|----------------|---------------|
| 9-10 | UI polish, Export features | Problem creation (13 problems) |
| 11-12 | Testing, Mobile responsive | Testing, Performance optimization |

---

## IX. Excalidraw Features

### Free Features (from Excalidraw)
- ✅ Hand-drawn, sketchy aesthetic
- ✅ Pan and zoom
- ✅ Undo/redo
- ✅ Multi-select, copy/paste
- ✅ Export to PNG/SVG
- ✅ Dark mode
- ✅ Keyboard shortcuts

### Custom Features (we add)
- Component library (8 pre-built system components)
- Component configuration (inspector panel)
- Connection metadata (throughput, protocol)
- Simulation execution
- Automated grading

---

## X. Success Metrics

### MVP Success (Month 8)

| Metric | Target |
|--------|--------|
| Users try feature | 50 |
| Users complete 1 problem | 20 |
| Average score | > 60 |
| NPS | > 40 |

### Post-MVP Features
1. Custom components
2. Multi-user collaboration
3. AI interviewer
4. Cost optimizer
5. Real-world case studies

---

## XI. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Simulation too slow | Medium | High | Batch processing, parallelization |
| Grading too subjective | High | Critical | User feedback, iterate rubric |
| Canvas too complex | Medium | Medium | Use proven Excalidraw library |
| Users don't understand | High | Critical | Onboarding tutorial, examples |

---

## XII. Future Features (Post-MVP Roadmap)

### 12.1 Advanced Real-World Simulation

Enhance simulation realism to better match production environments:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Latency Jitter** | Add ±20% variance to component latencies to simulate real network conditions | High |
| **Cold Start Modeling** | First N requests have higher latency (connection establishment, JIT warm-up) | Medium |
| **Cascading Failures** | Model cache failure → DB overload → system-wide degradation | High |
| **Thundering Herd** | Simulate cache expiry causing simultaneous DB requests | Medium |
| **Network Partitions** | Nodes unable to communicate (split-brain scenarios) | Low |
| **Geographic Latency** | Model cross-region latency for multi-region designs | Low |

**Implementation Approach:**
```python
def calculate_latency_with_jitter(base_latency: float, jitter_factor: float = 0.2) -> float:
    """Add realistic variance to latency."""
    jitter = random.uniform(-jitter_factor, jitter_factor)
    return base_latency * (1 + jitter)
```

---

### 12.2 Automated Cloud Deployment (Enterprise Premium)

**Target Customers:** Companies conducting technical interviews who want to validate candidate designs in real infrastructure.

**Feature Overview:**
Convert user-designed systems into actual cloud deployments (AWS/GCP/Azure) for real-world validation.

| Capability | Description |
|------------|-------------|
| **IaC Generation** | Generate Terraform/Pulumi from canvas design |
| **One-Click Deploy** | Deploy candidate's design to sandbox environment |
| **Real Load Testing** | Run actual traffic against deployed system |
| **Cost Validation** | Compare estimated vs actual cloud costs |
| **Auto-Teardown** | Automatically destroy resources after evaluation |

**Use Cases:**
1. **Interview Validation:** Company deploys top 3 candidate designs, measures real performance
2. **Team Training:** Engineers deploy their designs to see real-world behavior
3. **Architecture Review:** Validate proposed designs before production

**Pricing Model:**
- Enterprise license: $X,XXX/month
- Per-deployment charge: $XX/deployment (covers cloud costs + margin)
- Sandbox time limit: 1 hour max per deployment

**Technical Architecture:**
```
Canvas Design → Design Parser → IaC Generator → Cloud Provider API
                                      ↓
                            Terraform/Pulumi Template
                                      ↓
                            Sandbox VPC Deployment
                                      ↓
                            Real Load Test → Metrics Collection
                                      ↓
                            Auto-Teardown (after 1 hour)
```

**Security Considerations:**
- Isolated VPC per deployment
- No access to customer production data
- Resource quotas to prevent abuse
- Audit logging for compliance

---

### 12.3 Estimation Mode

**Problem:** In real interviews, candidates must do back-of-envelope calculations. Our simulation does this automatically, which doesn't build the mental math skills interviewers test.

**Solution:** Before running simulation, users estimate their system's performance. Then compare estimates vs simulation results.

**User Flow:**
```
1. User completes design on canvas
   ↓
2. Clicks "Run Simulation"
   ↓
3. Estimation Mode Modal appears:
   ┌─────────────────────────────────────────┐
   │ Before we simulate, estimate your      │
   │ system's performance:                   │
   │                                         │
   │ Max Throughput (QPS):  [________]       │
   │ Expected P99 Latency:  [________] ms    │
   │ Estimated Monthly Cost: $[________]     │
   │                                         │
   │ [Skip Estimation]  [Submit & Simulate]  │
   └─────────────────────────────────────────┘
   ↓
4. Simulation runs
   ↓
5. Results show comparison:
   ┌─────────────────────────────────────────┐
   │ Your Estimates vs Actual Results        │
   │                                         │
   │ Throughput:  You: 5,000  Actual: 4,200  │
   │              → 16% overestimate ⚠️      │
   │                                         │
   │ P99 Latency: You: 100ms  Actual: 85ms   │
   │              → Good estimate! ✓         │
   │                                         │
   │ Cost:        You: $2,000  Actual: $2,500│
   │              → 20% underestimate ⚠️     │
   └─────────────────────────────────────────┘
```

**Grading Integration:**
- Add optional bonus points (up to 10) for accurate estimates
- Track estimation accuracy over time
- Show "estimation skill" graph in user profile

**Benefits:**
- Builds back-of-envelope calculation skills
- Prepares users for follow-up questions like "How did you arrive at that number?"
- Differentiates strong candidates who understand their designs deeply

---

### 12.4 Feature Prioritization

| Feature | Impact | Effort | Priority | Timeline |
|---------|--------|--------|----------|----------|
| Estimation Mode | High | Low | P1 | Month 9 |
| Latency Jitter | Medium | Low | P1 | Month 9 |
| Cascading Failures | High | Medium | P2 | Month 10 |
| Thundering Herd | Medium | Medium | P2 | Month 11 |
| Automated Deployment | Very High | Very High | P3 | Months 12-15 |
| Network Partitions | Low | High | P4 | TBD |

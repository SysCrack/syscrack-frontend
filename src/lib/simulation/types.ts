/**
 * Simulation type definitions.
 * Matches the structure from the Python backend but decoupled from DB models.
 */

// ── Per-tick component state ──

export interface SimulationState {
    cpuUsagePercent: number;
    memoryUsageGb: number;
    latencyMs: number;
    errorRate: number;       // 0..1
    isHealthy: boolean;
    currentConnections: number;
    throughputQps: number;
}

export function defaultState(): SimulationState {
    return {
        cpuUsagePercent: 0,
        memoryUsageGb: 0,
        latencyMs: 0,
        errorRate: 0,
        isHealthy: true,
        currentConnections: 0,
        throughputQps: 0,
    };
}

// ── Diagnostics ──

export type DiagnosticSeverity = 'critical' | 'warning' | 'info';

export interface SimulationDiagnostic {
    componentId: string;
    componentName: string;
    severity: DiagnosticSeverity;
    eventType: string;         // 'overloaded' | 'high_utilization' | 'spof' | 'stampede_risk' etc.
    message: string;
    suggestion: string;
    metricValue?: number;
}

// ── Per-scenario result ──

export interface SimulationMetrics {
    throughputQps: number;
    requestsPerSecond: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    responseTimeMs: number;
    ttfbMs: number;
    errorRate: number;
    bottlenecks: string[];
    estimatedCostMonthly: number;
}

// ── Per-node summary (for canvas overlays) ──

export interface NodeSimSummary {
    avgCpuPercent: number;
    avgLatencyMs: number;
    avgErrorRate: number;
    isHealthy: boolean;  // healthy for >90% of ticks
}

// ── Live component inspector: extended per-node metrics + type-specific detail ──

export interface CacheEntry {
    key: string;
    age: number;       // seconds since inserted (simulated)
    ttl: number;       // configured TTL
    accessCount: number;
    willEvict: boolean; // true if this is the eviction candidate
}

export type CachePlacement = 'edge' | 'backend' | 'blob' | 'l2';

export type ComponentDetailData =
    | { kind: 'cache'; hitRate: number; hits: number; misses: number; entries: CacheEntry[]; evictionPolicy: string; readStrategy: string; writeStrategy: string; ttl: number; maxEntries: number; placement?: CachePlacement; staleReadCount?: number }
    | { kind: 'cdn'; hitRate: number; hits: number; misses: number; edgeLocations: number; ttl: number }
    | { kind: 'load_balancer'; algorithm: string; backends: { nodeId: string; name: string; sentRequests: number; activeConnections: number }[] }
    | {
        kind: 'proxy';
        algorithm: string;
        connectionPooling: boolean;
        maxConnections: number;
        backends: { nodeId: string; name: string; sentRequests: number; activeConnections: number }[];
        queueDepth?: number;
        activeConnections?: number;
        effectivePoolSize?: number;
        poolSize?: number;
    }
    | { kind: 'app_server'; activeInstances: number; maxInstances: number; autoScaling: boolean; instanceType: string; distributedTransaction?: string; sagaCompensation?: string }
    | { kind: 'database_sql'; engine: string; readCapacity: number; writeCapacity: number; readReplicas: number; connectionPooling: boolean; activeConnections: number; replicationLagMs?: number; staleReadCount?: number; isCompacting?: boolean; nextCompactionInSeconds?: number; isHotShard?: boolean; hotshardLatencyMultiplier?: number; shardCount?: number }
    | { kind: 'database_nosql'; engine: string; consistencyLevel: string; capacity: number; utilization: number; replicationLagMs?: number; staleReadCount?: number; isCompacting?: boolean; nextCompactionInSeconds?: number; quorumConditionMet?: boolean; quorumSummary?: string; isHotShard?: boolean; hotshardLatencyMultiplier?: number; shardCount?: number }
    | { kind: 'message_queue'; partitions: number; isFifo: boolean; queueDepth: number; enqueued: number; processed: number; deadLettered: number; droppedMessages?: number; deliveryGuarantee?: string }
    | { kind: 'object_store'; storageClass: string; capacity: number; utilization: number }
    | { kind: 'api_gateway'; authEnabled: boolean; rateLimiting: boolean; rateLimit: number; allowed: number; dropped: number }
    | { kind: 'client'; requestsPerSecond: number; readWriteRatio?: number };

export interface NodeDetailMetrics extends NodeSimSummary {
    currentRps: number;
    totalRequests: number;
    totalErrors: number;
    capacity: number;
    utilization: number;
    hitRate?: number;
    hits?: number;
    misses?: number;
    queueDepth?: number;
    activeConnections?: number;
    effectivePoolSize?: number;
    poolSize?: number;
    replicationLagMs?: number;
    staleReadCount?: number;
    writeErrorRate?: number;
    instanceCount?: number;
    diagnostics?: string[];
    componentDetail?: ComponentDetailData;
    quorumConditionMet?: boolean;
    quorumSummary?: string;
    isHotShard?: boolean;
    hotshardLatencyMultiplier?: number;
    shardCount?: number;
}

export interface ScenarioResult {
    scenario: string;       // 'Normal Load' | 'Peak Load'
    passed: boolean;
    score: number;          // 0–100
    metrics: SimulationMetrics;
    feedback: string[];
    diagnostics: SimulationDiagnostic[];  // per-scenario diagnostics
    nodeMetrics: Record<string, NodeSimSummary>;
}

// ── Full output ──

export interface SimulationOutput {
    results: ScenarioResult[];
    totalScore: number;
    /** Structural diagnostics (SPOF etc.) — scenario-independent */
    spofDiagnostics: SimulationDiagnostic[];
}

// ── Request method / read-write types ──

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type ReadWrite = 'read' | 'write';
export type PayloadSize = 'tiny' | 'small' | 'medium' | 'large';

export function methodToReadWrite(method?: RequestMethod): ReadWrite {
    if (!method || method === 'GET') return 'read';
    return 'write';
}

export const PAYLOAD_LATENCY_MULTIPLIER: Record<PayloadSize, number> = {
    tiny: 0.8,
    small: 1.0,
    medium: 1.3,
    large: 1.8,
};

// ── Request trace (step-through debug, DAG model) ──

export interface RequestTraceEvent {
    id: string;             // unique event ID within this trace
    parentId?: string;      // parent event ID (undefined = root); enables tree structure
    nodeId: string;
    nodeName: string;
    nodeType: string;
    action: string;
    timestamp: number;      // sim tick
    method?: RequestMethod;
    readWrite?: ReadWrite;
    latencyMs?: number;
    status?: 'ok' | 'error' | 'warning';
    staleRead?: boolean;    // true when read hit cache but data was pending write-behind
}

export interface RequestTrace {
    id: string;
    events: RequestTraceEvent[];
    completed: boolean;
    pendingBranches: number; // count of branches still in flight; 0 = all done
}

// ── Engine config ──

export interface SimulationScenario {
    name: string;
    loadFactor: number;
}

export const DEFAULT_SCENARIOS: SimulationScenario[] = [
    { name: 'Normal Load', loadFactor: 1.0 },
    { name: 'Peak Load', loadFactor: 2.0 },
];

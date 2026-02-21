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

export type ComponentDetailData =
    | { kind: 'cache'; hitRate: number; hits: number; misses: number; entries: CacheEntry[]; evictionPolicy: string; readStrategy: string; writeStrategy: string; ttl: number; maxEntries: number }
    | { kind: 'cdn'; hitRate: number; hits: number; misses: number; edgeLocations: number; ttl: number }
    | { kind: 'load_balancer'; algorithm: string; backends: { nodeId: string; name: string; sentRequests: number; activeConnections: number }[] }
    | { kind: 'app_server'; activeInstances: number; maxInstances: number; autoScaling: boolean; instanceType: string }
    | { kind: 'database_sql'; engine: string; readCapacity: number; writeCapacity: number; readReplicas: number; connectionPooling: boolean; activeConnections: number }
    | { kind: 'database_nosql'; engine: string; consistencyLevel: string; capacity: number; utilization: number }
    | { kind: 'message_queue'; partitions: number; isFifo: boolean; queueDepth: number; enqueued: number; processed: number; deadLettered: number }
    | { kind: 'object_store'; storageClass: string; capacity: number; utilization: number }
    | { kind: 'api_gateway'; authEnabled: boolean; rateLimiting: boolean; rateLimit: number; allowed: number; dropped: number }
    | { kind: 'client'; requestsPerSecond: number };

export interface NodeDetailMetrics extends NodeSimSummary {
    currentRps: number;
    totalRequests: number;
    totalErrors: number;
    capacity: number;
    utilization: number;
    componentDetail?: ComponentDetailData;
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

// ── Request trace (step-through debug) ──

export interface RequestTraceEvent {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    action: string;   // e.g. "routed to App Server (round-robin)", "cache HIT on /user/3"
    timestamp: number; // sim tick
}

export interface RequestTrace {
    id: string;
    events: RequestTraceEvent[];
    completed: boolean;
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

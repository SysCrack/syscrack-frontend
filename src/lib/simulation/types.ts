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

// ── Engine config ──

export interface SimulationScenario {
    name: string;
    loadFactor: number;
}

export const DEFAULT_SCENARIOS: SimulationScenario[] = [
    { name: 'Normal Load', loadFactor: 1.0 },
    { name: 'Peak Load', loadFactor: 2.0 },
];

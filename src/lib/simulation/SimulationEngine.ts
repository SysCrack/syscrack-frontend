/**
 * SimulationEngine — client-side simulation ported from Python.
 *
 * Builds a directed graph from canvas nodes + connections, does a topological
 * traversal to propagate traffic, and collects per-tick metrics for each component.
 *
 * No networkx dependency — uses simple adjacency list + Kahn's algorithm.
 */
import type { CanvasNode, CanvasConnection, CanvasComponentType } from '@/lib/types/canvas';
import type {
    SimulationState,
    SimulationOutput,
    ScenarioResult,
    SimulationMetrics,
    SimulationDiagnostic,
    SimulationScenario,
} from './types';
import { DEFAULT_SCENARIOS } from './types';
import { ComponentModel } from './ComponentModel';
import {
    ClientModel,
    CDNModel,
    LoadBalancerModel,
    APIGatewayModel,
    AppServerModel,
    CacheModel,
    DatabaseSQLModel,
    DatabaseNoSQLModel,
    ObjectStoreModel,
    MessageQueueModel,
} from './models';

// ── Model factory ──

const MODEL_FACTORIES: Partial<Record<CanvasComponentType, new (node: CanvasNode) => ComponentModel>> = {
    client: ClientModel,
    cdn: CDNModel,
    load_balancer: LoadBalancerModel,
    api_gateway: APIGatewayModel,
    app_server: AppServerModel,
    cache: CacheModel,
    database_sql: DatabaseSQLModel,
    database_nosql: DatabaseNoSQLModel,
    object_store: ObjectStoreModel,
    message_queue: MessageQueueModel,
};

/** Fallback for unknown component types */
class GenericModel extends ComponentModel {
    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        return {
            cpuUsagePercent: Math.min(100, loadQps / 100),
            memoryUsageGb: 0,
            latencyMs: 10,
            errorRate: 0,
            isHealthy: true,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }
    maxCapacityQps(): number { return 10000; }
}

// ── Flow priority — determines order among siblings ──

const FLOW_PRIORITY: Partial<Record<CanvasComponentType, number>> = {
    cache: 1,
    database_sql: 2,
    database_nosql: 2,
    message_queue: 3,
    object_store: 4,
    app_server: 5,
};

// ── Topological sort (Kahn's algorithm) ──

function topologicalSort(
    nodeIds: string[],
    adjacency: Map<string, string[]>,
): string[] {
    const inDegree = new Map<string, number>();
    for (const id of nodeIds) inDegree.set(id, 0);

    for (const [, targets] of adjacency) {
        for (const t of targets) {
            inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
        const node = queue.shift()!;
        sorted.push(node);
        for (const succ of (adjacency.get(node) ?? [])) {
            const newDeg = (inDegree.get(succ) ?? 1) - 1;
            inDegree.set(succ, newDeg);
            if (newDeg === 0) queue.push(succ);
        }
    }

    // If there's a cycle, just append remaining nodes (degrade gracefully)
    if (sorted.length < nodeIds.length) {
        for (const id of nodeIds) {
            if (!sorted.includes(id)) sorted.push(id);
        }
    }

    return sorted;
}

// ── Percentile helper ──

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
    return sorted[idx];
}

// ── Engine ──

export class SimulationEngine {
    private models: Map<string, ComponentModel> = new Map();
    private adjacency: Map<string, string[]> = new Map();
    private nodeTypes: Map<string, CanvasComponentType> = new Map();
    private executionOrder: string[] = [];
    private clientIds: string[] = [];

    constructor(
        private nodes: CanvasNode[],
        private connections: CanvasConnection[],
    ) {
        this.buildGraph();
    }

    private buildGraph() {
        const nodeIds: string[] = [];

        for (const node of this.nodes) {
            const Factory = MODEL_FACTORIES[node.type] ?? GenericModel;
            this.models.set(node.id, new Factory(node));
            this.adjacency.set(node.id, []);
            this.nodeTypes.set(node.id, node.type);
            nodeIds.push(node.id);

            if (node.type === 'client') {
                this.clientIds.push(node.id);
            }
        }

        for (const conn of this.connections) {
            const targets = this.adjacency.get(conn.sourceId);
            if (targets) targets.push(conn.targetId);
        }

        this.executionOrder = topologicalSort(nodeIds, this.adjacency);
    }

    /** Run all scenarios and return aggregated output. */
    run(
        durationSeconds = 60,
        scenarios: SimulationScenario[] = DEFAULT_SCENARIOS,
    ): SimulationOutput {
        const scenarioResults: ScenarioResult[] = [];

        for (const scenario of scenarios) {
            const result = this.runScenario(scenario, durationSeconds);
            scenarioResults.push(result);
        }

        const totalScore = scenarioResults.length > 0
            ? Math.round(scenarioResults.reduce((s, r) => s + r.score, 0) / scenarioResults.length)
            : 0;

        // Collect SPOF diagnostics (structural, not load-dependent)
        const spofDiagnostics: SimulationDiagnostic[] = [];
        for (const node of this.nodes) {
            if (node.type === 'client') continue;
            const instances = node.sharedConfig.scaling?.instances ?? 1;
            const hasSuccessors = (this.adjacency.get(node.id)?.length ?? 0) > 0;
            const hasPredecessors = this.connections.some((c) => c.targetId === node.id);

            if (instances <= 1 && (hasSuccessors || hasPredecessors)) {
                spofDiagnostics.push({
                    componentId: node.id,
                    componentName: node.name,
                    severity: 'warning',
                    eventType: 'spof',
                    message: `⚠ ${node.name} is a single point of failure (1 instance)`,
                    suggestion: 'Increase instances or enable auto-scaling for redundancy',
                });
            }
        }

        return { results: scenarioResults, totalScore, spofDiagnostics };
    }

    /** Get base QPS from client config, or default 1000. */
    private getClientBaseQps(clientId: string): number {
        const node = this.nodes.find((n) => n.id === clientId);
        if (!node) return 1000;
        const rps = (node.specificConfig as Record<string, unknown>).requestsPerSecond;
        return typeof rps === 'number' && rps > 0 ? rps : 1000;
    }

    /** Get Load Balancer algorithm from node config. */
    private getLBAlgorithm(nodeId: string): string {
        const node = this.nodes.find((n) => n.id === nodeId);
        if (!node) return 'round-robin';
        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string;
        return algo || 'round-robin';
    }

    /**
     * Distribute inputQps from an LB to successors according to configured algorithm.
     * Mutates nodeLoads in place.
     */
    private distributeLBLoad(
        nodeId: string,
        inputQps: number,
        successors: string[],
        nodeLoads: Map<string, number>,
        history: Map<string, SimulationState[]>,
    ): void {
        if (successors.length === 0 || inputQps <= 0) return;
        const algo = this.getLBAlgorithm(nodeId);

        switch (algo) {
            case 'least-connections': {
                // Prefer successors with lower current load (use previous tick's throughput as proxy for "connections")
                const loads = successors.map((s) => {
                    const prevStates = history.get(s) ?? [];
                    const currentLoad = nodeLoads.get(s) ?? 0;
                    const prevThroughput = prevStates.length > 0 ? prevStates[prevStates.length - 1].throughputQps : 0;
                    return { s, busy: currentLoad + prevThroughput * 0.5 };
                });
                const totalInv = loads.reduce((sum, { busy }) => sum + 1 / (1 + busy), 0);
                if (totalInv <= 0) {
                    const per = inputQps / successors.length;
                    for (const s of successors) nodeLoads.set(s, (nodeLoads.get(s) ?? 0) + per);
                } else {
                    for (const { s, busy } of loads) {
                        const share = (1 / (1 + busy)) / totalInv;
                        nodeLoads.set(s, (nodeLoads.get(s) ?? 0) + inputQps * share);
                    }
                }
                break;
            }
            case 'random': {
                const weights = successors.map(() => Math.random());
                const sum = weights.reduce((a, b) => a + b, 0);
                for (let i = 0; i < successors.length; i++) {
                    const s = successors[i];
                    const share = sum > 0 ? weights[i] / sum : 1 / successors.length;
                    nodeLoads.set(s, (nodeLoads.get(s) ?? 0) + inputQps * share);
                }
                break;
            }
            case 'round-robin':
            case 'weighted':
            default: {
                const splitQps = inputQps / successors.length;
                for (const s of successors) nodeLoads.set(s, (nodeLoads.get(s) ?? 0) + splitQps);
                break;
            }
        }
    }

    private runScenario(
        scenario: SimulationScenario,
        durationSeconds: number,
    ): ScenarioResult {
        const history: Map<string, SimulationState[]> = new Map();
        for (const id of this.executionOrder) history.set(id, []);

        // Per-scenario diagnostics
        const diagnostics: SimulationDiagnostic[] = [];

        let score = 100;
        const bottleneckSet = new Set<string>();

        for (let t = 0; t < durationSeconds; t++) {
            // Traffic wave: small oscillation
            const wave = 1.0 + Math.sin(t / 10) * 0.2;
            const currentFactor = scenario.loadFactor * wave;

            // Initialize loads
            const nodeLoads = new Map<string, number>();
            for (const id of this.executionOrder) nodeLoads.set(id, 0);

            // Clients generate traffic from their configured RPS
            for (const cid of this.clientIds) {
                const baseQps = this.getClientBaseQps(cid);
                nodeLoads.set(cid, baseQps * currentFactor);
            }

            // If no clients, inject traffic into root nodes (no predecessors)
            if (this.clientIds.length === 0) {
                const roots = this.executionOrder.filter(
                    (id) => !this.connections.some((c) => c.targetId === id),
                );
                for (const rid of roots) {
                    nodeLoads.set(rid, 1000 * currentFactor);
                }
            }

            // Propagate through execution order
            for (const nodeId of this.executionOrder) {
                const model = this.models.get(nodeId)!;
                const inputQps = nodeLoads.get(nodeId) ?? 0;
                const conns = Math.floor(inputQps / 10);

                const state = model.processRequest(inputQps, conns);
                history.get(nodeId)!.push(state);

                // Score impact
                if (!state.isHealthy) {
                    score -= 1;
                    bottleneckSet.add(model.name);
                }

                score -= state.errorRate * 10;

                // Propagate to successors
                const successors = this.adjacency.get(nodeId) ?? [];
                if (successors.length > 0 && inputQps > 0) {
                    const sorted = [...successors].sort(
                        (a, b) =>
                            (FLOW_PRIORITY[this.nodeTypes.get(a)!] ?? 99) -
                            (FLOW_PRIORITY[this.nodeTypes.get(b)!] ?? 99),
                    );

                    const nodeType = this.nodeTypes.get(nodeId)!;

                    if (nodeType === 'load_balancer') {
                        this.distributeLBLoad(nodeId, inputQps, sorted, nodeLoads, history);
                    } else if (nodeType === 'cache' || nodeType === 'cdn') {
                        // Cache/CDN reduces via hit rate
                        const cacheModel = model as CacheModel | CDNModel;
                        const hitRate = 'hitRate' in cacheModel ? cacheModel.hitRate : 0.85;
                        const missQps = inputQps * (1 - hitRate);
                        for (const s of sorted) nodeLoads.set(s, (nodeLoads.get(s) ?? 0) + missQps);
                    } else {
                        // Default: broadcast full traffic
                        for (const s of sorted) nodeLoads.set(s, (nodeLoads.get(s) ?? 0) + inputQps);
                    }
                }
            }
        }

        // After the tick loop, generate diagnostics from the LAST tick's state
        // (represents steady-state, not transient spikes)
        for (const nodeId of this.executionOrder) {
            const states = history.get(nodeId)!;
            if (states.length === 0) continue;
            const model = this.models.get(nodeId)!;
            if (model.type === 'client') continue;

            const last = states[states.length - 1];
            const avgCpu = states.reduce((a, s) => a + s.cpuUsagePercent, 0) / states.length;
            const avgError = states.reduce((a, s) => a + s.errorRate, 0) / states.length;

            if (avgError > 0.01) {
                diagnostics.push({
                    componentId: nodeId,
                    componentName: model.name,
                    severity: 'critical',
                    eventType: 'overloaded',
                    message: `🔴 ${model.name} is overloaded (${(avgError * 100).toFixed(1)}% error rate)`,
                    suggestion: `Add more ${model.type} instances or increase capacity`,
                    metricValue: avgError,
                });
            } else if (avgCpu > 80) {
                diagnostics.push({
                    componentId: nodeId,
                    componentName: model.name,
                    severity: 'warning',
                    eventType: 'high_utilization',
                    message: `⚠️ ${model.name} at ${avgCpu.toFixed(0)}% avg CPU`,
                    suggestion: 'Consider scaling before reaching capacity',
                    metricValue: avgCpu / 100,
                });
            }
        }

        // Compute per-node summary metrics for canvas overlays
        const nodeMetrics: Record<string, import('./types').NodeSimSummary> = {};
        for (const nodeId of this.executionOrder) {
            const states = history.get(nodeId)!;
            if (states.length === 0) continue;
            const avgCpu = states.reduce((a, s) => a + s.cpuUsagePercent, 0) / states.length;
            const avgLat = states.reduce((a, s) => a + s.latencyMs, 0) / states.length;
            const avgErr = states.reduce((a, s) => a + s.errorRate, 0) / states.length;
            const healthyTicks = states.filter((s) => s.isHealthy).length;
            nodeMetrics[nodeId] = {
                avgCpuPercent: Math.round(avgCpu * 10) / 10,
                avgLatencyMs: Math.round(avgLat * 100) / 100,
                avgErrorRate: Math.round(avgErr * 10000) / 10000,
                isHealthy: healthyTicks / states.length > 0.9,
            };
        }

        // Aggregate metrics
        const metrics = this.aggregateMetrics(history, bottleneckSet);
        const passed = score > 60 && metrics.errorRate < 0.01;

        return {
            scenario: scenario.name,
            passed,
            score: Math.max(0, Math.round(score)),
            metrics,
            feedback: Array.from(bottleneckSet),
            diagnostics,
            nodeMetrics,
        };
    }

    private aggregateMetrics(
        history: Map<string, SimulationState[]>,
        bottleneckSet: Set<string>,
    ): SimulationMetrics {
        const allLatencies: number[] = [];
        let maxErrorRate = 0;
        let totalThroughput = 0;

        for (const [nodeId, states] of history) {
            if (states.length === 0) continue;

            for (const s of states) {
                allLatencies.push(s.latencyMs);
            }

            const avgError = states.reduce((a, s) => a + s.errorRate, 0) / states.length;
            maxErrorRate = Math.max(maxErrorRate, avgError);

            // Sum client throughputs
            if (this.nodeTypes.get(nodeId) === 'client') {
                totalThroughput += states.reduce((a, s) => a + s.throughputQps, 0) / states.length;
            }
        }

        // If no clients, use root node throughput
        if (totalThroughput === 0 && this.clientIds.length === 0) {
            for (const [, states] of history) {
                if (states.length > 0) {
                    totalThroughput = states.reduce((a, s) => a + s.throughputQps, 0) / states.length;
                    break;
                }
            }
        }

        const sorted = [...allLatencies].sort((a, b) => a - b);
        const p50 = percentile(sorted, 0.50);
        const p95 = percentile(sorted, 0.95);
        const p99 = percentile(sorted, 0.99);
        const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
        const responseTime = p99 * 1.5;
        const ttfb = p50 * 0.8;

        return {
            throughputQps: Math.round(totalThroughput),
            requestsPerSecond: Math.round(totalThroughput),
            avgLatencyMs: Math.round(avg * 100) / 100,
            p50LatencyMs: Math.round(p50 * 100) / 100,
            p95LatencyMs: Math.round(p95 * 100) / 100,
            p99LatencyMs: Math.round(p99 * 100) / 100,
            responseTimeMs: Math.round(responseTime * 100) / 100,
            ttfbMs: Math.round(ttfb * 100) / 100,
            errorRate: Math.round(maxErrorRate * 10000) / 10000,
            bottlenecks: Array.from(bottleneckSet),
            estimatedCostMonthly: this.estimateCost(),
        };
    }

    /** Cost estimate based on component count × instances × base price. */
    private estimateCost(): number {
        let cost = 0;
        for (const node of this.nodes) {
            if (node.type === 'client') continue;
            const instances = node.sharedConfig.scaling?.instances ?? 1;
            const baseCost: Partial<Record<CanvasComponentType, number>> = {
                cdn: 50,
                load_balancer: 25,
                api_gateway: 35,
                app_server: 80,
                cache: 60,
                database_sql: 150,
                database_nosql: 100,
                object_store: 20,
                message_queue: 30,
            };
            cost += (baseCost[node.type] ?? 50) * instances;
        }
        return Math.round(cost);
    }
}

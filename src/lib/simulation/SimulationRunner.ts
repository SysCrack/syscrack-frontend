/**
 * SimulationRunner — live tick-by-tick simulation with particle system.
 *
 * Runs via requestAnimationFrame. Each frame:
 *   1. Spawns request particles at client nodes
 *   2. Moves existing particles along their connections (t: 0→1)
 *   3. When a particle arrives (t ≥ 1), processes it through the target component
 *   4. Spawns downstream particles based on component behavior
 *   5. Updates live metrics
 *
 * Particle flow is topology-aware:
 *   - LB: splits per algorithm (round-robin, least-conn, weighted, random)
 *   - Cache/CDN: absorbs hitRate%, forwards misses
 *   - DB/Queue/Store: absorbs (leaf node)
 */
import type { CanvasNode, CanvasConnection, CanvasComponentType } from '@/lib/types/canvas';
import type { NodeSimSummary } from './types';

// ── Particle ──

export interface RequestParticle {
    id: string;
    connectionId: string;
    t: number;            // 0→1 progress along the bezier
    count: number;        // how many requests this particle represents
    color: string;        // '#22d3ee' healthy, '#f87171' error
    sourceId: string;
    targetId: string;
}

// ── Live metrics ──

export interface LiveMetrics {
    rps: number;
    avgLatencyMs: number;
    errorRate: number;
    estimatedCostMonthly: number;
    nodeMetrics: Record<string, NodeSimSummary>;
}

// ── Callback ──

export type RunnerCallback = (
    particles: RequestParticle[],
    metrics: LiveMetrics,
    tick: number,
) => void;

// ── Runner ──

let nextParticleId = 0;

export class SimulationRunner {
    private rafId = 0;
    private running = false;
    private tick = 0;
    private particles: RequestParticle[] = [];
    private lastFrameTime = 0;
    private accumulator = 0;
    private rpsAccumulator = 0;

    // LB round-robin counters
    private rrCounters: Map<string, number> = new Map();
    // Continuous client spawn accumulators
    private clientAccumulators: Map<string, number> = new Map();
    // Per-node active particle count (for least-connections)
    private nodeActiveCount: Map<string, number> = new Map();
    // Live RPS tracking (EMA)
    private nodeRecentArrivals: Map<string, number> = new Map();
    private nodeRpsEma: Map<string, number> = new Map();
    // Per-node rolling metrics
    private nodeRequestCount: Map<string, number> = new Map();
    private nodeErrorCount: Map<string, number> = new Map();
    private nodeLatencySum: Map<string, number> = new Map();

    // Graph
    private adjacency: Map<string, string[]> = new Map();        // nodeId → [targetNodeId]
    private connectionMap: Map<string, CanvasConnection> = new Map(); // connId → conn
    private connectionsBySource: Map<string, CanvasConnection[]> = new Map(); // nodeId → outbound conns
    private nodeMap: Map<string, CanvasNode> = new Map();

    speed = 1.0;
    loadFactor = 1.0;

    constructor(
        private nodes: CanvasNode[],
        private connections: CanvasConnection[],
        private callback: RunnerCallback,
    ) {
        this.buildGraph();
    }

    private buildGraph() {
        for (const node of this.nodes) {
            this.nodeMap.set(node.id, node);
            this.adjacency.set(node.id, []);
            this.connectionsBySource.set(node.id, []);
            this.nodeActiveCount.set(node.id, 0);
            this.nodeRecentArrivals.set(node.id, 0);
            this.nodeRpsEma.set(node.id, 0);
            this.nodeRequestCount.set(node.id, 0);
            this.nodeErrorCount.set(node.id, 0);
            this.nodeLatencySum.set(node.id, 0);
            if (node.type === 'client') {
                this.clientAccumulators.set(node.id, 0);
            }
        }
        for (const conn of this.connections) {
            this.connectionMap.set(conn.id, conn);
            this.adjacency.get(conn.sourceId)?.push(conn.targetId);
            this.connectionsBySource.get(conn.sourceId)?.push(conn);
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastFrameTime = performance.now();
        this.accumulator = 0;
        this.loop(this.lastFrameTime);
    }

    pause() {
        this.running = false;
        cancelAnimationFrame(this.rafId);
    }

    reset() {
        this.pause();
        this.tick = 0;
        this.particles = [];
        this.rrCounters.clear();
        this.clientAccumulators.clear();
        this.nodeActiveCount.clear();
        this.nodeRecentArrivals.clear();
        this.nodeRpsEma.clear();
        this.rpsAccumulator = 0;
        this.nodeRequestCount.clear();
        this.nodeErrorCount.clear();
        this.nodeLatencySum.clear();
        for (const node of this.nodes) {
            this.nodeActiveCount.set(node.id, 0);
            this.nodeRecentArrivals.set(node.id, 0);
            this.nodeRpsEma.set(node.id, 0);
            this.nodeRequestCount.set(node.id, 0);
            this.nodeErrorCount.set(node.id, 0);
            this.nodeLatencySum.set(node.id, 0);
            if (node.type === 'client') {
                this.clientAccumulators.set(node.id, 0);
            }
        }
        nextParticleId = 0;
    }

    setSpeed(s: number) { this.speed = Math.max(0.25, Math.min(4, s)); }
    setLoadFactor(f: number) { this.loadFactor = Math.max(0.1, Math.min(5, f)); }

    get isRunning() { return this.running; }

    // ── Main loop ──

    private loop = (now: number) => {
        if (!this.running) return;

        const dt = Math.min(now - this.lastFrameTime, 100); // cap at 100ms
        this.lastFrameTime = now;

        // Base travel time: takes 1500ms to cross a connection at 1.0x speed
        const travelTimeMs = 1500;
        const tDelta = (dt / travelTimeMs) * this.speed;

        // 1. Move particles and process arrivals
        const arriving: RequestParticle[] = [];
        const remaining: RequestParticle[] = [];

        for (const p of this.particles) {
            p.t += tDelta;
            if (p.t >= 1) {
                arriving.push(p);
            } else {
                remaining.push(p);
            }
        }

        this.particles = remaining;

        // 2. Process arrivals
        for (const p of arriving) {
            this.processArrival(p);
        }

        // 3. Update RPS EMA (Exponential Moving Average) based on simulated time
        this.rpsAccumulator += dt * this.speed;

        if (this.rpsAccumulator >= 500) { // Every 500ms of simulated time
            for (const node of this.nodes) {
                const count = this.nodeRecentArrivals.get(node.id) ?? 0;
                // Exact rate over the accumulated simulated time
                const rpsThisPeriod = count * (1000 / this.rpsAccumulator);
                const prevEma = this.nodeRpsEma.get(node.id) ?? 0;

                // Exponential smoothing
                const alpha = 0.6;
                if (count === 0 && prevEma < 1) {
                    this.nodeRpsEma.set(node.id, 0); // snap to 0 to prevent long tails
                } else {
                    this.nodeRpsEma.set(node.id, rpsThisPeriod * alpha + prevEma * (1 - alpha));
                }

                this.nodeRecentArrivals.set(node.id, 0);
            }
            this.rpsAccumulator = 0;
        }

        // 4. Continuous client spawning
        for (const node of this.nodes) {
            if (node.type !== 'client') continue;

            const rps = this.getClientRps(node);
            const loadRps = rps * this.loadFactor;

            // Cap visual particles per second (e.g. 3 to 25) so it doesn't flood the browser
            // Higher load = more frequent particle spawning + larger particles
            const visualParticlesPerSec = Math.min(25, Math.max(3, loadRps / 40));
            const requestsPerParticle = loadRps / visualParticlesPerSec; // batch size per dot

            let acc = this.clientAccumulators.get(node.id) ?? 0;
            acc += (dt / 1000) * visualParticlesPerSec * this.speed;

            while (acc >= 1) {
                acc -= 1;
                this.spawnFromNode(node.id, requestsPerParticle);

                // Track for client RPS metric
                this.nodeRecentArrivals.set(
                    node.id,
                    (this.nodeRecentArrivals.get(node.id) ?? 0) + requestsPerParticle,
                );
            }
            this.clientAccumulators.set(node.id, acc);
        }

        // 3. Tick logic for static metrics only
        const tickInterval = 500 / this.speed;
        this.accumulator += dt;

        while (this.accumulator >= tickInterval) {
            this.accumulator -= tickInterval;
            this.tick++;
        }

        // Emit
        this.callback(
            [...this.particles],
            this.computeLiveMetrics(),
            this.tick,
        );

        this.rafId = requestAnimationFrame(this.loop);
    };



    // ── Spawn ──

    private spawnFromNode(nodeId: string, count: number) {
        const outConns = this.connectionsBySource.get(nodeId) ?? [];
        if (outConns.length === 0) return;

        const node = this.nodeMap.get(nodeId)!;
        const nodeType = node.type;

        // Track requests through this node
        this.nodeRequestCount.set(nodeId, (this.nodeRequestCount.get(nodeId) ?? 0) + count);

        if (nodeType === 'load_balancer') {
            this.spawnFromLB(node, outConns, count);
        } else if (nodeType === 'cache' || nodeType === 'cdn') {
            this.spawnFromCache(node, outConns, count);
        } else {
            // Default: broadcast to all downstream
            for (const conn of outConns) {
                this.emitParticle(conn, count);
            }
        }
    }

    private spawnFromLB(node: CanvasNode, outConns: CanvasConnection[], count: number) {
        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string || 'round-robin';

        if (outConns.length === 0) return;

        switch (algo) {
            case 'round-robin': {
                // Send each batch sequentially to the next connection
                const idx = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
                this.rrCounters.set(node.id, idx + 1);
                this.emitParticle(outConns[idx], count);
                break;
            }

            case 'least-connections': {
                // Pick the downstream target with fewest active particles
                let minConn = outConns[0];
                let minCount = Infinity;
                for (const conn of outConns) {
                    const active = this.nodeActiveCount.get(conn.targetId) ?? 0;
                    if (active < minCount) {
                        minCount = active;
                        minConn = conn;
                    }
                }
                this.emitParticle(minConn, count);
                break;
            }

            case 'random': {
                const idx = Math.floor(Math.random() * outConns.length);
                this.emitParticle(outConns[idx], count);
                break;
            }

            case 'weighted':
            default: {
                // Even split (weighted would need weights in config)
                const perConn = Math.max(1, Math.round(count / outConns.length));
                for (const conn of outConns) {
                    this.emitParticle(conn, perConn);
                }
                break;
            }
        }
    }

    private spawnFromCache(node: CanvasNode, outConns: CanvasConnection[], count: number) {
        // Cache/CDN hit rate — absorb hits, forward misses
        const hitRate = this.getCacheHitRate(node);
        const misses = Math.max(1, Math.round(count * (1 - hitRate)));

        // Forward misses downstream
        for (const conn of outConns) {
            this.emitParticle(conn, misses, '#22d3ee'); // still healthy, just reduced
        }
    }

    // ── Process arrival ──

    private processArrival(particle: RequestParticle) {
        const targetNode = this.nodeMap.get(particle.targetId);
        if (!targetNode) return;

        // Decrement active count
        const prev = this.nodeActiveCount.get(particle.targetId) ?? 0;
        this.nodeActiveCount.set(particle.targetId, Math.max(0, prev - 1));

        // Track arrivals for RPS calculations
        this.nodeRecentArrivals.set(
            particle.targetId,
            (this.nodeRecentArrivals.get(particle.targetId) ?? 0) + particle.count,
        );

        // Track lifetime requests metrics
        this.nodeRequestCount.set(
            particle.targetId,
            (this.nodeRequestCount.get(particle.targetId) ?? 0) + particle.count,
        );

        // Check if target can handle the load using current RPS vs capacity
        const capacity = this.getNodeCapacity(targetNode);
        const currentLoadRps = this.nodeRpsEma.get(particle.targetId) ?? 0;
        const isOverloaded = currentLoadRps > capacity;

        if (isOverloaded) {
            this.nodeErrorCount.set(
                particle.targetId,
                (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count,
            );
        }

        // Add latency
        const latency = this.getNodeLatency(targetNode, currentLoadRps, capacity);
        this.nodeLatencySum.set(
            particle.targetId,
            (this.nodeLatencySum.get(particle.targetId) ?? 0) + latency * particle.count,
        );

        // Propagate downstream (unless it's a leaf)
        const isLeaf = this.isLeafNode(targetNode.type);
        if (!isLeaf) {
            this.spawnFromNode(particle.targetId, particle.count);
        }
    }

    // ── Helpers ──

    private emitParticle(conn: CanvasConnection, count: number, colorOverride?: string) {
        const id = `p${nextParticleId++}`;
        this.particles.push({
            id,
            connectionId: conn.id,
            t: 0,
            count,
            color: colorOverride ?? '#22d3ee',
            sourceId: conn.sourceId,
            targetId: conn.targetId,
        });

        // Increment active count on target
        this.nodeActiveCount.set(
            conn.targetId,
            (this.nodeActiveCount.get(conn.targetId) ?? 0) + 1,
        );
    }

    private getClientRps(node: CanvasNode): number {
        const rps = (node.specificConfig as Record<string, unknown>).requestsPerSecond;
        return typeof rps === 'number' && rps > 0 ? rps : 1000;
    }

    private getCacheHitRate(node: CanvasNode): number {
        const specific = node.specificConfig as Record<string, unknown>;
        const ttl = (specific.defaultTtl as number) ?? (specific.cacheTtl as number) ?? 3600;
        const strategy = (specific.readStrategy as string) ?? 'cache-aside';
        let hitRate = 0.85;
        if (strategy === 'read-through') hitRate = 0.9;
        if (ttl > 7200) hitRate += 0.05;
        if (ttl < 600) hitRate -= 0.15;
        return Math.min(0.99, Math.max(0.1, hitRate));
    }

    private getNodeCapacity(node: CanvasNode): number {
        const replicas = node.sharedConfig.scaling?.replicas ?? 1;
        const rps = node.sharedConfig.scaling?.nodeCapacityRps ?? 1000;
        return replicas * rps;
    }

    private getNodeLatency(node: CanvasNode, load: number, capacity: number): number {
        const utilization = Math.min(load / Math.max(capacity, 1), 1);
        const baseLat: Partial<Record<CanvasComponentType, number>> = {
            client: 0,
            cdn: 2,
            load_balancer: 1,
            api_gateway: 5,
            app_server: 15,
            cache: 2,
            database_sql: 10,
            database_nosql: 5,
            object_store: 50,
            message_queue: 5,
        };
        const base = baseLat[node.type] ?? 10;
        // Queueing delay: latency spikes as utilization → 1
        const queueFactor = utilization > 0.8 ? 1 / (1 - utilization + 0.01) : 1;
        return base * queueFactor;
    }

    private isLeafNode(type: CanvasComponentType): boolean {
        return ['database_sql', 'database_nosql', 'object_store', 'message_queue'].includes(type);
    }

    // ── Live metrics ──

    private computeLiveMetrics(): LiveMetrics {
        let totalRequests = 0;
        let currentClientRps = 0;
        let totalErrors = 0;
        let totalLatency = 0;
        const nodeMetrics: Record<string, NodeSimSummary> = {};

        for (const node of this.nodes) {
            const reqs = this.nodeRequestCount.get(node.id) ?? 0;
            const errs = this.nodeErrorCount.get(node.id) ?? 0;
            const latSum = this.nodeLatencySum.get(node.id) ?? 0;

            if (node.type === 'client') {
                totalRequests += reqs;
                currentClientRps += this.nodeRpsEma.get(node.id) ?? 0;
            }
            totalErrors += errs;
            totalLatency += latSum;

            const capacity = this.getNodeCapacity(node);
            const currentRps = this.nodeRpsEma.get(node.id) ?? 0;
            const avgCpu = capacity > 0 ? Math.min(100, (currentRps / Math.max(capacity, 1)) * 100) : 0;

            nodeMetrics[node.id] = {
                avgCpuPercent: Math.round(avgCpu * 10) / 10,
                avgLatencyMs: reqs > 0 ? Math.round(latSum / reqs * 100) / 100 : 0,
                avgErrorRate: reqs > 0 ? errs / reqs : 0,
                isHealthy: reqs === 0 || errs / reqs < 0.1,
            };
        }

        // Cost estimation
        let cost = 0;
        const baseCost: Partial<Record<CanvasComponentType, number>> = {
            cdn: 50, load_balancer: 25, api_gateway: 35, app_server: 80,
            cache: 60, database_sql: 150, database_nosql: 100, object_store: 20, message_queue: 30,
        };
        for (const node of this.nodes) {
            if (node.type === 'client') continue;
            const replicas = node.sharedConfig.scaling?.replicas ?? 1;
            cost += (baseCost[node.type] ?? 50) * replicas;
        }

        return {
            rps: Math.round(currentClientRps),
            avgLatencyMs: totalRequests > 0
                ? Math.round(totalLatency / totalRequests * 100) / 100
                : 0,
            errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
            estimatedCostMonthly: Math.round(cost),
            nodeMetrics,
        };
    }
}

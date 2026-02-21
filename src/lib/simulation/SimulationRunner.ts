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
import type { NodeSimSummary, NodeDetailMetrics, CacheEntry, RequestTraceEvent, RequestTrace } from './types';

// ── Cache entry simulator (bounded entries, eviction by policy) ──

const CACHE_KEY_POOL: string[] = [];
for (let i = 1; i <= 12; i++) CACHE_KEY_POOL.push(`/user/${i}`);
for (let i = 1; i <= 8; i++) CACHE_KEY_POOL.push(`/product/${i}`);
for (let i = 1; i <= 4; i++) CACHE_KEY_POOL.push(`/session/${i}`);

const CACHE_ENTRIES_CAP = 1000; // max user-configurable ceiling

interface CacheEntryState {
    key: string;
    insertedAt: number;
    lastAccessAt: number;
    accessCount: number;
}

class CacheEntrySimulator {
    private entries = new Map<string, CacheEntryState>();
    private readonly maxEntries: number;
    private readonly evictionPolicy: string;
    private readonly ttl: number;
    private simTick = 0;

    constructor(maxEntries: number, evictionPolicy: string, ttl: number) {
        this.maxEntries = Math.min(Math.max(1, maxEntries), CACHE_ENTRIES_CAP);
        this.evictionPolicy = evictionPolicy || 'lru';
        this.ttl = ttl;
    }

    /** Compressed TTL: ttl seconds -> ticks so expiration is visible during simulation (e.g. 500s -> ~1000 ticks) */
    private getTtlTicks(): number {
        return Math.max(60, this.ttl * 2);
    }

    advanceTick() {
        this.simTick++;
        // Proactive TTL expiration: remove entries that have exceeded their TTL
        if (this.evictionPolicy === 'ttl-based' && this.ttl > 0) {
            const ttlTicks = this.getTtlTicks();
            for (const [key, e] of Array.from(this.entries.entries())) {
                if (this.simTick - e.insertedAt > ttlTicks) {
                    this.entries.delete(key);
                }
            }
        }
    }

    recordHit(key: string) {
        const existing = this.entries.get(key);
        if (existing) {
            existing.lastAccessAt = this.simTick;
            existing.accessCount++;
            return;
        }
        this.recordMiss(key);
    }

    recordMiss(key: string) {
        if (this.entries.has(key)) return;
        if (this.entries.size >= this.maxEntries) {
            const evictKey = this.pickEvictionCandidate();
            if (evictKey) this.entries.delete(evictKey);
        }
        if (this.entries.size < this.maxEntries) {
            this.entries.set(key, {
                key,
                insertedAt: this.simTick,
                lastAccessAt: this.simTick,
                accessCount: 1,
            });
        }
    }

    private pickEvictionCandidate(): string | null {
        if (this.entries.size === 0) return null;
        const list = Array.from(this.entries.entries());
        switch (this.evictionPolicy) {
            case 'lru':
                return list.reduce((a, b) => (a[1].lastAccessAt < b[1].lastAccessAt ? a : b))[0];
            case 'lfu':
                return list.reduce((a, b) => (a[1].accessCount < b[1].accessCount ? a : b))[0];
            case 'fifo':
                return list.reduce((a, b) => (a[1].insertedAt < b[1].insertedAt ? a : b))[0];
            case 'random':
                return list[Math.floor(Math.random() * list.length)][0];
            case 'ttl-based': {
                const ttlTicks = this.getTtlTicks();
                const expired = list.filter(([, e]) => this.simTick - e.insertedAt > ttlTicks);
                const candidates = expired.length > 0 ? expired : list;
                return candidates.reduce((a, b) => (a[1].insertedAt < b[1].insertedAt ? a : b))[0];
            }
            default:
                return list[0][0];
        }
    }

    getEntries(): CacheEntry[] {
        const evictKey = this.entries.size >= this.maxEntries ? this.pickEvictionCandidate() : null;
        const entries = Array.from(this.entries.values()).map((e) => ({
            key: e.key,
            age: Math.max(0, this.simTick - e.insertedAt),
            ttl: this.ttl,
            accessCount: e.accessCount,
            willEvict: evictKey === e.key,
        }));
        // Sort so eviction candidate appears first (visible in truncated list)
        return entries.sort((a, b) => (a.willEvict ? 0 : 1) - (b.willEvict ? 0 : 1));
    }

    static keyFromPool(tick: number): string {
        return CACHE_KEY_POOL[Math.abs(tick) % CACHE_KEY_POOL.length];
    }

    static randomKeyFromPool(): string {
        return CACHE_KEY_POOL[Math.floor(Math.random() * CACHE_KEY_POOL.length)];
    }
}

// ── Particle ──

export interface RequestParticle {
    id: string;
    connectionId: string;
    t: number;            // 0→1 progress along the bezier
    count: number;        // how many requests this particle represents
    color: string;        // '#22d3ee' healthy, '#f87171' error
    sourceId: string;
    targetId: string;
    traceId?: string;     // for step-through debug: tracks a single injected request
}

// ── Live metrics ──

export interface LiveMetrics {
    rps: number;
    avgLatencyMs: number;
    errorRate: number;
    estimatedCostMonthly: number;
    nodeMetrics: Record<string, NodeDetailMetrics>;
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

    // Inspector: cache/CDN hits and misses, cache entry simulator
    private cacheHits: Map<string, number> = new Map();
    private cacheMisses: Map<string, number> = new Map();
    private cacheSimulators: Map<string, CacheEntrySimulator> = new Map();

    // LB: requests sent per backend (nodeId -> targetId -> count)
    private lbSentRequests: Map<string, Map<string, number>> = new Map();

    // Message queue: enqueued, processed, dead-lettered per node
    private mqEnqueued: Map<string, number> = new Map();
    private mqProcessed: Map<string, number> = new Map();
    private mqDeadLettered: Map<string, number> = new Map();
    private mqProcessAccumulator: Map<string, number> = new Map();

    // API Gateway: allowance per step (reset each step), dropped cumulative
    private apiGatewayAllowanceRemaining: Map<string, number> = new Map();
    private apiGatewayDropped: Map<string, number> = new Map();

    // Graph
    private adjacency: Map<string, string[]> = new Map();        // nodeId → [targetNodeId]
    private connectionMap: Map<string, CanvasConnection> = new Map(); // connId → conn
    private connectionsBySource: Map<string, CanvasConnection[]> = new Map(); // nodeId → outbound conns
    private nodeMap: Map<string, CanvasNode> = new Map();

    // Step-through debug: active traces (traceId -> events)
    private activeTraces: Map<string, RequestTraceEvent[]> = new Map();
    private onTraceComplete?: (trace: RequestTrace) => void;
    private _suppressClientSpawning = false;
    private _tracedArrivalThisStep = false;

    speed = 1.0;
    loadFactor = 1.0;

    constructor(
        private nodes: CanvasNode[],
        private connections: CanvasConnection[],
        private callback: RunnerCallback,
        options?: { onTraceComplete?: (trace: RequestTrace) => void },
    ) {
        this.buildGraph();
        this.onTraceComplete = options?.onTraceComplete;
    }

    /** Update node configurations dynamically (e.g., when instances are changed during simulation) */
    updateNodes(nodes: CanvasNode[]) {
        this.nodes = nodes;
        // Rebuild node map with updated configs
        for (const node of nodes) {
            this.nodeMap.set(node.id, node);
        }
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
            if (node.type === 'cache' || node.type === 'cdn') {
                this.cacheHits.set(node.id, 0);
                this.cacheMisses.set(node.id, 0);
                const c = node.specificConfig as Record<string, unknown>;
                const ev = (c.evictionPolicy as string) ?? 'lru';
                const ttl = (c.defaultTtl as number) ?? (c.cacheTtl as number) ?? 3600;
                const maxEntries = node.type === 'cache' ? Math.min(1000, Math.max(1, (c.maxEntries as number) ?? 24)) : 24;
                this.cacheSimulators.set(node.id, new CacheEntrySimulator(maxEntries, ev, ttl));
            }
            if (node.type === 'load_balancer') {
                this.lbSentRequests.set(node.id, new Map());
            }
            if (node.type === 'message_queue') {
                this.mqEnqueued.set(node.id, 0);
                this.mqProcessed.set(node.id, 0);
                this.mqDeadLettered.set(node.id, 0);
                this.mqProcessAccumulator.set(node.id, 0);
            }
            if (node.type === 'api_gateway') {
                this.apiGatewayDropped.set(node.id, 0);
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

    /** For Web Worker: set running so step(dt) is applied when driven by setInterval. */
    startForExternalLoop() {
        if (this.running) return;
        this.running = true;
        this.lastFrameTime = performance.now();
        this.accumulator = 0;
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
        this.cacheHits.clear();
        this.cacheMisses.clear();
        this.cacheSimulators.clear();
        this.lbSentRequests.clear();
        this.mqEnqueued.clear();
        this.mqProcessed.clear();
        this.mqDeadLettered.clear();
        this.mqProcessAccumulator.clear();
        this.apiGatewayAllowanceRemaining.clear();
        this.apiGatewayDropped.clear();
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
            if (node.type === 'cache' || node.type === 'cdn') {
                this.cacheHits.set(node.id, 0);
                this.cacheMisses.set(node.id, 0);
                const c = node.specificConfig as Record<string, unknown>;
                const ev = (c.evictionPolicy as string) ?? 'lru';
                const ttl = (c.defaultTtl as number) ?? (c.cacheTtl as number) ?? 3600;
                const maxEntries = node.type === 'cache' ? Math.min(1000, Math.max(1, (c.maxEntries as number) ?? 24)) : 24;
                this.cacheSimulators.set(node.id, new CacheEntrySimulator(maxEntries, ev, ttl));
            }
            if (node.type === 'load_balancer') {
                this.lbSentRequests.set(node.id, new Map());
            }
            if (node.type === 'message_queue') {
                this.mqEnqueued.set(node.id, 0);
                this.mqProcessed.set(node.id, 0);
                this.mqDeadLettered.set(node.id, 0);
                this.mqProcessAccumulator.set(node.id, 0);
            }
            if (node.type === 'api_gateway') {
                this.apiGatewayDropped.set(node.id, 0);
            }
        }
        nextParticleId = 0;
        this.activeTraces.clear();
    }

    /** Advance one frame regardless of running state (for step-through debug) */
    stepOnce(dt: number, suppressSpawning = false): void {
        const wasRunning = this.running;
        this.running = true;
        this._suppressClientSpawning = suppressSpawning;
        this._tracedArrivalThisStep = false;
        this.step(dt);
        this._suppressClientSpawning = false;
        this.running = wasRunning;
    }

    /**
     * Advance the simulation until a traced particle completes one connection hop.
     * If no traced particles exist, advances a single frame instead.
     */
    stepUntilNextArrival(): void {
        const hasTracedParticle = () => this.particles.some((p) => p.traceId);
        if (!hasTracedParticle()) {
            this.stepOnce(1000 / 60, true);
            return;
        }
        const MAX_ITERATIONS = 300;
        const wasRunning = this.running;
        this.running = true;
        this._suppressClientSpawning = true;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            this._tracedArrivalThisStep = false;
            this.step(1000 / 60);
            if (this._tracedArrivalThisStep || !hasTracedParticle()) break;
        }
        this._suppressClientSpawning = false;
        this.running = wasRunning;
    }

    /** Inject a single request at the given client node; returns traceId for step-through debug */
    injectSingleRequest(clientNodeId: string): string {
        const node = this.nodeMap.get(clientNodeId);
        if (!node || node.type !== 'client') return '';

        const outConns = this.connectionsBySource.get(clientNodeId) ?? [];
        if (outConns.length === 0) return '';

        const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.activeTraces.set(traceId, []);

        this.addTraceEvent(traceId, {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            action: 'injected request',
            timestamp: this.tick,
        });

        // Emit single particle on first connection (gold color for traced particles)
        this.emitParticle(outConns[0], 1, '#eab308', traceId);
        return traceId;
    }

    private addTraceEvent(traceId: string, event: RequestTraceEvent) {
        const events = this.activeTraces.get(traceId);
        if (events) events.push(event);
    }

    private finalizeTrace(traceId: string, completed: boolean) {
        const events = this.activeTraces.get(traceId);
        if (!events) return;
        this.activeTraces.delete(traceId);
        this.onTraceComplete?.({ id: traceId, events, completed });
    }

    setSpeed(s: number) { this.speed = Math.max(0.25, Math.min(4, s)); }
    setLoadFactor(f: number) { this.loadFactor = Math.max(0.1, Math.min(5, f)); }

    get isRunning() { return this.running; }

    // ── Main loop (main thread uses RAF; worker uses setInterval and calls step(dt)) ──

    /**
     * Perform one simulation frame. Call from requestAnimationFrame (main) or setInterval (worker).
     * @param dt elapsed time in ms (capped by caller, e.g. 100ms)
     */
    step(dt: number): void {
        if (!this.running) return;

        const cappedDt = Math.min(dt, 100);

        // Advance cache simulators (for entry age / eviction)
        for (const sim of this.cacheSimulators.values()) {
            sim.advanceTick();
        }
        // Reset API Gateway allowance this step (rate limit per second -> per dt)
        for (const node of this.nodes) {
            if (node.type === 'api_gateway') {
                const tc = node.sharedConfig.trafficControl;
                const limit = (tc?.rateLimiting && typeof tc.rateLimit === 'number') ? tc.rateLimit : 10000;
                this.apiGatewayAllowanceRemaining.set(node.id, limit * (cappedDt / 1000));
            }
        }
        // Advance message queue processing (drain by capacity)
        for (const node of this.nodes) {
            if (node.type !== 'message_queue') continue;
            const cap = this.getNodeCapacity(node);
            const enq = this.mqEnqueued.get(node.id) ?? 0;
            const proc = this.mqProcessed.get(node.id) ?? 0;
            const toProcess = Math.min(enq - proc, cap * (cappedDt / 1000));
            this.mqProcessed.set(node.id, proc + toProcess);
        }

        // Base travel time: takes 1500ms to cross a connection at 1.0x speed
        const travelTimeMs = 1500;
        const tDelta = (cappedDt / travelTimeMs) * this.speed;

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
        this.rpsAccumulator += cappedDt * this.speed;

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

        // 4. Continuous client spawning (skipped in debug/step mode)
        if (!this._suppressClientSpawning) {
            for (const node of this.nodes) {
                if (node.type !== 'client') continue;

                const rps = this.getClientRps(node);
                const loadRps = rps * this.loadFactor;

                const visualParticlesPerSec = Math.min(25, Math.max(3, loadRps / 40));
                const requestsPerParticle = loadRps / visualParticlesPerSec;

                let acc = this.clientAccumulators.get(node.id) ?? 0;
                acc += (cappedDt / 1000) * visualParticlesPerSec * this.speed;

                while (acc >= 1) {
                    acc -= 1;
                    this.spawnFromNode(node.id, requestsPerParticle);

                    this.nodeRecentArrivals.set(
                        node.id,
                        (this.nodeRecentArrivals.get(node.id) ?? 0) + requestsPerParticle,
                    );
                }
                this.clientAccumulators.set(node.id, acc);
            }
        }

        // Tick logic for static metrics only
        const tickInterval = 500 / this.speed;
        this.accumulator += cappedDt;

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
    }

    private loop = (now: number) => {
        if (!this.running) return;
        const dt = Math.min(now - this.lastFrameTime, 100);
        this.lastFrameTime = now;
        this.step(dt);
        this.rafId = requestAnimationFrame(this.loop);
    };



    // ── Spawn ──

    private spawnFromNode(nodeId: string, count: number, traceId?: string) {
        const outConns = this.connectionsBySource.get(nodeId) ?? [];
        if (outConns.length === 0) return;

        const node = this.nodeMap.get(nodeId)!;
        const nodeType = node.type;

        // Track requests through this node
        this.nodeRequestCount.set(nodeId, (this.nodeRequestCount.get(nodeId) ?? 0) + count);

        if (nodeType === 'load_balancer') {
            this.spawnFromLB(node, outConns, count, traceId);
        } else if (nodeType === 'cache' || nodeType === 'cdn') {
            this.spawnFromCache(node, outConns, count, traceId);
        } else if (nodeType === 'api_gateway') {
            const allowance = this.apiGatewayAllowanceRemaining.get(node.id) ?? 0;
            const allowed = Math.min(count, Math.max(0, allowance));
            this.apiGatewayAllowanceRemaining.set(node.id, allowance - allowed);
            this.apiGatewayDropped.set(node.id, (this.apiGatewayDropped.get(node.id) ?? 0) + (count - allowed));
            if (traceId) {
                const action = allowed > 0 ? 'forwarded' : 'rate limited (dropped)';
                this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action, timestamp: this.tick });
                if (allowed === 0) {
                    this._tracedArrivalThisStep = true;
                    this.finalizeTrace(traceId, false);
                    return;
                }
            }
            for (const conn of outConns) {
                this.emitParticle(conn, allowed, undefined, traceId);
            }
        } else {
            // Default: broadcast to all downstream
            if (traceId) {
                const targetNames = outConns.map((c) => this.nodeMap.get(c.targetId)?.name ?? c.targetId).join(', ');
                this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `forwarded to ${targetNames}`, timestamp: this.tick });
            }
            for (const conn of outConns) {
                this.emitParticle(conn, count, undefined, traceId);
            }
        }
    }

    private spawnFromLB(node: CanvasNode, outConns: CanvasConnection[], count: number, traceId?: string) {
        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string || 'round-robin';

        if (outConns.length === 0) return;

        const recordSent = (targetId: string, n: number) => {
            const m = this.lbSentRequests.get(node.id)!;
            m.set(targetId, (m.get(targetId) ?? 0) + n);
        };

        let chosenConn: CanvasConnection | null = null;

        switch (algo) {
            case 'round-robin': {
                const idx = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
                this.rrCounters.set(node.id, idx + 1);
                chosenConn = outConns[idx];
                this.emitParticle(chosenConn, count, undefined, traceId);
                recordSent(chosenConn.targetId, count);
                break;
            }

            case 'least-connections': {
                let minConn = outConns[0];
                let minCount = Infinity;
                for (const conn of outConns) {
                    const active = this.nodeActiveCount.get(conn.targetId) ?? 0;
                    if (active < minCount) {
                        minCount = active;
                        minConn = conn;
                    }
                }
                chosenConn = minConn;
                this.emitParticle(minConn, count, undefined, traceId);
                recordSent(minConn.targetId, count);
                break;
            }

            case 'random': {
                const idx = Math.floor(Math.random() * outConns.length);
                chosenConn = outConns[idx];
                this.emitParticle(chosenConn, count, undefined, traceId);
                recordSent(chosenConn.targetId, count);
                break;
            }

            case 'weighted':
            default: {
                // For traced single request: pick one backend so trace follows one path
                if (traceId && count === 1) {
                    const idx = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
                    this.rrCounters.set(node.id, idx + 1);
                    chosenConn = outConns[idx];
                    this.emitParticle(chosenConn, 1, undefined, traceId);
                    recordSent(chosenConn.targetId, 1);
                } else {
                    const perConn = Math.max(1, Math.round(count / outConns.length));
                    chosenConn = outConns[0];
                    for (const conn of outConns) {
                        this.emitParticle(conn, perConn, undefined, traceId);
                        recordSent(conn.targetId, perConn);
                    }
                }
                break;
            }
        }

        if (traceId && chosenConn) {
            const targetName = this.nodeMap.get(chosenConn.targetId)?.name ?? chosenConn.targetId;
            this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `routed to ${targetName} (${algo})`, timestamp: this.tick });
        }
    }

    private spawnFromCache(node: CanvasNode, outConns: CanvasConnection[], count: number, traceId?: string) {
        const hitRate = this.getCacheHitRate(node);
        const misses = Math.max(1, Math.round(count * (1 - hitRate)));
        const hits = Math.round(Math.max(0, count - misses));

        this.cacheHits.set(node.id, (this.cacheHits.get(node.id) ?? 0) + hits);
        this.cacheMisses.set(node.id, (this.cacheMisses.get(node.id) ?? 0) + misses);

        const sim = this.cacheSimulators.get(node.id);
        const key = sim ? CacheEntrySimulator.randomKeyFromPool() : '/unknown';
        if (sim) {
            for (let i = 0; i < hits; i++) sim.recordHit(CacheEntrySimulator.randomKeyFromPool());
            for (let i = 0; i < misses; i++) sim.recordMiss(CacheEntrySimulator.randomKeyFromPool());
        }

        if (traceId) {
            const action = hits > 0 && misses === 0 ? `cache HIT on ${key}` : `cache MISS on ${key} -> forwarded to downstream`;
            this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action, timestamp: this.tick });
            if (hits > 0 && misses === 0) {
                this._tracedArrivalThisStep = true;
                this.finalizeTrace(traceId, true);
                return;
            }
        }

        for (const conn of outConns) {
            this.emitParticle(conn, misses, '#f59e0b', traceId);
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

        // Message queue: track enqueued (arrivals at queue)
        if (targetNode.type === 'message_queue') {
            this.mqEnqueued.set(
                particle.targetId,
                (this.mqEnqueued.get(particle.targetId) ?? 0) + particle.count,
            );
        }

        // Propagate downstream (unless it's a leaf)
        const isLeaf = this.isLeafNode(targetNode.type);
        if (particle.traceId) {
            this._tracedArrivalThisStep = true;
            if (isLeaf) {
                this.addTraceEvent(particle.traceId, {
                    nodeId: targetNode.id,
                    nodeName: targetNode.name,
                    nodeType: targetNode.type,
                    action: 'request completed',
                    timestamp: this.tick,
                });
                this.finalizeTrace(particle.traceId, true);
            } else {
                this.spawnFromNode(particle.targetId, particle.count, particle.traceId);
            }
        } else if (!isLeaf) {
            this.spawnFromNode(particle.targetId, particle.count);
        }
    }

    // ── Helpers ──

    private emitParticle(conn: CanvasConnection, count: number, colorOverride?: string, traceId?: string) {
        const id = `p${nextParticleId++}`;
        this.particles.push({
            id,
            connectionId: conn.id,
            t: 0,
            count,
            color: traceId ? '#eab308' : (colorOverride ?? '#22d3ee'),
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            traceId,
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
        const c = node.specificConfig as Record<string, unknown>;
        const ttl = (c.defaultTtl as number) ?? (c.cacheTtl as number) ?? 3600;
        const readStrategy = (c.readStrategy as string) ?? 'cache-aside';
        const writeStrategy = (c.writeStrategy as string) ?? 'write-around';
        const evictionPolicy = (c.evictionPolicy as string) ?? 'lru';
        let hitRate = 0.85;
        if (readStrategy === 'read-through') hitRate = 0.9;
        if (ttl > 7200) hitRate += 0.05;
        if (ttl < 600) hitRate -= 0.15;
        if (writeStrategy === 'write-through') hitRate += 0.02;
        else if (writeStrategy === 'write-behind') hitRate -= 0.01;
        if (evictionPolicy === 'lfu') hitRate += 0.02;
        else if (evictionPolicy === 'fifo' || evictionPolicy === 'random') hitRate -= 0.02;
        return Math.min(0.99, Math.max(0.1, hitRate));
    }

    private getNodeCapacity(node: CanvasNode): number {
        const instances = node.sharedConfig.scaling?.instances ?? 1;
        const rps = node.sharedConfig.scaling?.nodeCapacityRps ?? 1000;
        return instances * rps;
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
        const nodeMetrics: Record<string, NodeDetailMetrics> = {};

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
            const utilization = capacity > 0 ? Math.min(1, currentRps / capacity) : 0;

            const detail: NodeDetailMetrics = {
                avgCpuPercent: Math.round(avgCpu * 10) / 10,
                avgLatencyMs: reqs > 0 ? Math.round(latSum / reqs * 100) / 100 : 0,
                avgErrorRate: reqs > 0 ? errs / reqs : 0,
                isHealthy: reqs === 0 || errs / reqs < 0.1,
                currentRps: Math.round(currentRps),
                totalRequests: reqs,
                totalErrors: errs,
                capacity,
                utilization: Math.round(utilization * 1000) / 1000,
            };

            const c = node.specificConfig as Record<string, unknown>;
            const sc = node.sharedConfig;

            switch (node.type) {
                case 'cache': {
                    const hits = this.cacheHits.get(node.id) ?? 0;
                    const misses = this.cacheMisses.get(node.id) ?? 0;
                    const total = hits + misses;
                    detail.componentDetail = {
                        kind: 'cache',
                        hitRate: total > 0 ? hits / total : 0,
                        hits,
                        misses,
                        entries: this.cacheSimulators.get(node.id)?.getEntries() ?? [],
                        evictionPolicy: (c.evictionPolicy as string) ?? 'lru',
                        readStrategy: (c.readStrategy as string) ?? 'cache-aside',
                        writeStrategy: (c.writeStrategy as string) ?? 'write-around',
                        ttl: (c.defaultTtl as number) ?? 3600,
                        maxEntries: Math.min(1000, Math.max(1, (c.maxEntries as number) ?? 24)),
                    };
                    break;
                }
                case 'cdn': {
                    const hits = this.cacheHits.get(node.id) ?? 0;
                    const misses = this.cacheMisses.get(node.id) ?? 0;
                    const total = hits + misses;
                    detail.componentDetail = {
                        kind: 'cdn',
                        hitRate: total > 0 ? hits / total : 0,
                        hits,
                        misses,
                        edgeLocations: (c.edgeLocations as number) ?? 10,
                        ttl: (c.cacheTtl as number) ?? 3600,
                    };
                    break;
                }
                case 'load_balancer': {
                    const sentMap = this.lbSentRequests.get(node.id);
                    const backends = (this.adjacency.get(node.id) ?? []).map((targetId) => {
                        const targetNode = this.nodeMap.get(targetId);
                        return {
                            nodeId: targetId,
                            name: targetNode?.name ?? targetId,
                            sentRequests: sentMap?.get(targetId) ?? 0,
                            activeConnections: this.nodeActiveCount.get(targetId) ?? 0,
                        };
                    });
                    detail.componentDetail = {
                        kind: 'load_balancer',
                        algorithm: (c.algorithm as string) ?? 'round-robin',
                        backends,
                    };
                    break;
                }
                case 'app_server': {
                    const instances = sc.scaling?.instances ?? 1;
                    detail.componentDetail = {
                        kind: 'app_server',
                        activeInstances: instances,
                        maxInstances: (c.maxInstances as number) ?? 10,
                        autoScaling: (c.autoScaling as boolean) ?? false,
                        instanceType: (c.instanceType as string) ?? 'medium',
                    };
                    break;
                }
                case 'database_sql': {
                    const cap = this.getNodeCapacity(node);
                    detail.componentDetail = {
                        kind: 'database_sql',
                        engine: (c.engine as string) ?? 'postgresql',
                        readCapacity: Math.round(cap * 0.8),
                        writeCapacity: Math.round(cap * 0.2),
                        readReplicas: (c.readReplicas as number) ?? 0,
                        connectionPooling: (c.connectionPooling as boolean) ?? true,
                        activeConnections: this.nodeActiveCount.get(node.id) ?? 0,
                    };
                    break;
                }
                case 'database_nosql': {
                    const cap = this.getNodeCapacity(node);
                    detail.componentDetail = {
                        kind: 'database_nosql',
                        engine: (c.engine as string) ?? 'dynamodb',
                        consistencyLevel: (c.consistencyLevel as string) ?? 'eventual',
                        capacity: cap,
                        utilization,
                    };
                    break;
                }
                case 'message_queue': {
                    const enq = this.mqEnqueued.get(node.id) ?? 0;
                    const proc = this.mqProcessed.get(node.id) ?? 0;
                    detail.componentDetail = {
                        kind: 'message_queue',
                        partitions: sc.scaling?.instances ?? 1,
                        isFifo: (c.type as string) === 'fifo',
                        queueDepth: Math.max(0, enq - proc),
                        enqueued: enq,
                        processed: proc,
                        deadLettered: this.mqDeadLettered.get(node.id) ?? 0,
                    };
                    break;
                }
                case 'object_store': {
                    detail.componentDetail = {
                        kind: 'object_store',
                        storageClass: (c.storageClass as string) ?? 'standard',
                        capacity,
                        utilization,
                    };
                    break;
                }
                case 'api_gateway': {
                    const reqCount = this.nodeRequestCount.get(node.id) ?? 0;
                    const dropped = this.apiGatewayDropped.get(node.id) ?? 0;
                    const tc = sc.trafficControl;
                    const rateLimit = (tc?.rateLimiting && typeof tc.rateLimit === 'number') ? tc.rateLimit : 10000;
                    detail.componentDetail = {
                        kind: 'api_gateway',
                        authEnabled: (c.authEnabled as boolean) ?? true,
                        rateLimiting: tc?.rateLimiting ?? false,
                        rateLimit,
                        allowed: Math.max(0, reqCount - dropped),
                        dropped,
                    };
                    break;
                }
                case 'client': {
                    detail.componentDetail = {
                        kind: 'client',
                        requestsPerSecond: this.getClientRps(node),
                    };
                    break;
                }
                default:
                    break;
            }

            nodeMetrics[node.id] = detail;
        }

        let cost = 0;
        const baseCost: Partial<Record<CanvasComponentType, number>> = {
            cdn: 50, load_balancer: 25, api_gateway: 35, app_server: 80,
            cache: 60, database_sql: 150, database_nosql: 100, object_store: 20, message_queue: 30,
        };
        for (const node of this.nodes) {
            if (node.type === 'client') continue;
            const instances = node.sharedConfig.scaling?.instances ?? 1;
            cost += (baseCost[node.type] ?? 50) * instances;
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

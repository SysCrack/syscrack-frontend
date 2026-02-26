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
import { PROTOCOL_FACTORS } from '@/lib/connectionRules';
import type { NodeSimSummary, NodeDetailMetrics, CacheEntry, RequestTraceEvent, RequestTrace, RequestMethod, ReadWrite, PayloadSize } from './types';
import { methodToReadWrite, PAYLOAD_LATENCY_MULTIPLIER } from './types';
import { classifyEdges, EdgeSemantics, ChaosPolicy } from './TopologyInference';

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

    hasKey(key: string): boolean {
        return this.entries.has(key);
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
    method?: RequestMethod;
    readWrite?: ReadWrite;
    payloadSize?: PayloadSize;
    path?: string;        // e.g. /users/123
}

// ── Live metrics ──

export interface LiveMetrics {
    rps: number;
    avgLatencyMs: number;
    errorRate: number;
    estimatedCostMonthly: number;
    readParticles: number;
    writeParticles: number;
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
    // Throttle downstream particles so visual density reflects hit rate
    private cacheDownstreamAccumulator: Map<string, number> = new Map();
    private cacheDownstreamBatchCount: Map<string, number> = new Map();

    // LB: requests sent per backend (nodeId -> targetId -> count)
    private lbSentRequests: Map<string, Map<string, number>> = new Map();
    // Proxy: requests sent per backend (nodeId -> targetId -> count) — separate from LB to avoid naming confusion
    private proxySentRequests: Map<string, Map<string, number>> = new Map();

    // Message queue: enqueued, processed, dead-lettered per node
    private mqEnqueued: Map<string, number> = new Map();
    private mqProcessed: Map<string, number> = new Map();
    private mqDeadLettered: Map<string, number> = new Map();
    private mqProcessAccumulator: Map<string, number> = new Map();

    // API Gateway: allowance per step (reset each step), dropped cumulative
    private apiGatewayAllowanceRemaining: Map<string, number> = new Map();
    private apiGatewayDropped: Map<string, number> = new Map();

    // Circuit Breakers & Cascading Failures
    public circuitBreakerState: Map<string, 'closed' | 'open' | 'half-open'> = new Map();
    private circuitBreakerTripTick: Map<string, number> = new Map();
    private nodeTickRequests: Map<string, number> = new Map();
    private nodeTickErrors: Map<string, number> = new Map();
    private nodeHistory: Map<string, { reqs: number; errs: number }[]> = new Map();
    private lbRemovedBackends: Map<string, Set<string>> = new Map();
    private lbBackendConsecutiveHighErrors: Map<string, number> = new Map();

    // Graph
    private adjacency: Map<string, string[]> = new Map();        // nodeId → [targetNodeId]
    private connectionMap: Map<string, CanvasConnection> = new Map(); // connId → conn
    private connectionsBySource: Map<string, CanvasConnection[]> = new Map(); // nodeId → outbound conns
    private connectionsByTarget: Map<string, CanvasConnection[]> = new Map(); // nodeId → inbound conns
    private nodeMap: Map<string, CanvasNode> = new Map();

    // ── Topology Semantics ──
    public edgeSemantics: Map<string, EdgeSemantics> = new Map();

    // Step-through debug: active traces (traceId -> { events, pendingBranches })
    private activeTraces: Map<string, { events: RequestTraceEvent[]; pendingBranches: number }> = new Map();
    private _nextTraceEventId = 0;
    private onTraceComplete?: (trace: RequestTrace) => void;
    private _suppressClientSpawning = false;
    private _tracedArrivalThisStep = false;
    private _traceOnlyMode = false;

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
        for (const node of nodes) {
            this.nodeMap.set(node.id, node);
        }
    }

    private buildGraph() {
        for (const node of this.nodes) {
            this.nodeMap.set(node.id, node);
            this.adjacency.set(node.id, []);
            this.connectionsBySource.set(node.id, []);
            this.connectionsByTarget.set(node.id, []);
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
                this.cacheDownstreamAccumulator.set(node.id, 0);
                this.cacheDownstreamBatchCount.set(node.id, 0);
                const c = node.specificConfig as Record<string, unknown>;
                const ev = (c.evictionPolicy as string) ?? 'lru';
                const ttl = (c.defaultTtl as number) ?? (c.cacheTtl as number) ?? 3600;
                const maxEntries = node.type === 'cache' ? Math.min(1000, Math.max(1, (c.maxEntries as number) ?? 24)) : 24;
                this.cacheSimulators.set(node.id, new CacheEntrySimulator(maxEntries, ev, ttl));
            }
            if (node.type === 'load_balancer') {
                this.lbSentRequests.set(node.id, new Map());
            }
            if (node.type === 'proxy') {
                this.proxySentRequests.set(node.id, new Map());
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
            this.connectionsByTarget.get(conn.targetId)?.push(conn);
        }

        // Pre-compute routing semantics for all edges
        this.edgeSemantics = classifyEdges(this.nodes, this.connections);
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
        this.proxySentRequests.clear();
        this.mqEnqueued.clear();
        this.mqProcessed.clear();
        this.mqDeadLettered.clear();
        this.mqProcessAccumulator.clear();
        this.apiGatewayAllowanceRemaining.clear();
        this.apiGatewayDropped.clear();

        this.circuitBreakerState.clear();
        this.circuitBreakerTripTick.clear();
        this.nodeTickRequests.clear();
        this.nodeTickErrors.clear();
        this.nodeHistory.clear();
        this.lbRemovedBackends.clear();
        this.lbBackendConsecutiveHighErrors.clear();
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
                this.cacheDownstreamAccumulator.set(node.id, 0);
                this.cacheDownstreamBatchCount.set(node.id, 0);
                const c = node.specificConfig as Record<string, unknown>;
                const ev = (c.evictionPolicy as string) ?? 'lru';
                const ttl = (c.defaultTtl as number) ?? (c.cacheTtl as number) ?? 3600;
                const maxEntries = node.type === 'cache' ? Math.min(1000, Math.max(1, (c.maxEntries as number) ?? 24)) : 24;
                this.cacheSimulators.set(node.id, new CacheEntrySimulator(maxEntries, ev, ttl));
            }
            this.circuitBreakerState.set(node.id, 'closed');
            this.circuitBreakerTripTick.set(node.id, 0);
            this.nodeTickRequests.set(node.id, 0);
            this.nodeTickErrors.set(node.id, 0);
            this.nodeHistory.set(node.id, []);

            if (node.type === 'load_balancer') {
                this.lbSentRequests.set(node.id, new Map());
                this.lbRemovedBackends.set(node.id, new Set());
            }
            if (node.type === 'proxy') {
                this.proxySentRequests.set(node.id, new Map());
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

    /**
     * Advance simulation until all traced particles complete (reach leaves).
     * Used for step-through debugging when you want one request fully done before the next.
     */
    stepUntilTracedRequestCompletes(): void {
        const hasTracedParticle = () => this.particles.some((p) => p.traceId);
        if (!hasTracedParticle()) return;
        const MAX_ITERATIONS = 500; // safety cap for deep topologies
        const wasRunning = this.running;
        this.running = true;
        this._suppressClientSpawning = true;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            this.step(1000 / 60);
            if (!hasTracedParticle()) break;
        }
        this._suppressClientSpawning = false;
        this.running = wasRunning;
    }

    /** Advance simulation by a fixed duration (ms). Used for "follow behind" inject spacing. */
    stepFor(ms: number): void {
        const frameMs = 1000 / 60;
        let elapsed = 0;
        const target = Math.max(0, ms);
        const wasRunning = this.running;
        this.running = true;
        this._suppressClientSpawning = true;
        while (elapsed < target) {
            const dt = Math.min(frameMs, target - elapsed);
            this.step(dt);
            elapsed += dt;
        }
        this._suppressClientSpawning = false;
        this.running = wasRunning;
    }

    /** Inject a single request at the given client node; returns traceId for step-through debug */
    injectSingleRequest(
        clientNodeId: string,
        method?: RequestMethod,
        payloadSize?: PayloadSize,
        path?: string,
    ): string {
        const node = this.nodeMap.get(clientNodeId);
        if (!node || node.type !== 'client') return '';

        const outConns = this.connectionsBySource.get(clientNodeId) ?? [];
        if (outConns.length === 0) return '';

        const rw = methodToReadWrite(method);
        const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.activeTraces.set(traceId, { events: [], pendingBranches: 1 });

        const pathStr = path ? ` ${path}` : '';
        this.addTraceEvent(traceId, {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            action: `injected ${method ?? 'GET'}${pathStr} request`,
            timestamp: this.tick,
            method,
            readWrite: rw,
        });

        const fakeParent: RequestParticle = {
            id: '', connectionId: '', t: 0, count: 1, color: '',
            sourceId: '', targetId: '', traceId,
            method, readWrite: rw, payloadSize, path,
        };
        this.emitParticle(outConns[0], 1, undefined, traceId, fakeParent);
        return traceId;
    }

    private addTraceEvent(
        traceId: string,
        event: Omit<RequestTraceEvent, 'id'> & { parentId?: string },
    ): string {
        const trace = this.activeTraces.get(traceId);
        if (!trace) return '';
        const eventId = `evt-${this._nextTraceEventId++}`;
        trace.events.push({ ...event, id: eventId });
        return eventId;
    }

    /** Decrement pending branches; finalize when all done */
    private finalizeBranch(traceId: string, completed: boolean) {
        const trace = this.activeTraces.get(traceId);
        if (!trace) return;
        trace.pendingBranches = Math.max(0, trace.pendingBranches - 1);
        if (trace.pendingBranches <= 0) {
            this.activeTraces.delete(traceId);
            this.onTraceComplete?.({
                id: traceId,
                events: trace.events,
                completed,
                pendingBranches: 0,
            });
        }
    }

    /** Legacy: finalize entire trace immediately (for non-branching paths) */
    private finalizeTrace(traceId: string, completed: boolean) {
        const trace = this.activeTraces.get(traceId);
        if (!trace) return;
        this.activeTraces.delete(traceId);
        this.onTraceComplete?.({
            id: traceId,
            events: trace.events,
            completed,
            pendingBranches: 0,
        });
    }

    setSpeed(s: number) { this.speed = Math.max(0.25, Math.min(4, s)); }
    setLoadFactor(f: number) { this.loadFactor = Math.max(0.1, Math.min(5, f)); }
    setTraceOnlyMode(v: boolean) { this._traceOnlyMode = v; }

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
        let tDelta = (cappedDt / travelTimeMs) * this.speed;
        tDelta = Math.min(tDelta, 1.0); // Cap so no particle overshoots 1.0 in one frame

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

        // 4. Continuous client spawning (skipped in debug/step mode or trace-only mode)
        if (!this._suppressClientSpawning && !this._traceOnlyMode) {
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
                    const rw = this.sampleReadWrite(node);
                    this.spawnFromNode(node.id, requestsPerParticle, undefined, undefined, rw);

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

            for (const node of this.nodes) {
                const hist = this.nodeHistory.get(node.id) ?? [];
                const reqs = this.nodeTickRequests.get(node.id) ?? 0;
                const errs = this.nodeTickErrors.get(node.id) ?? 0;
                hist.push({ reqs, errs });
                if (hist.length > 10) hist.shift();
                this.nodeHistory.set(node.id, hist);

                this.nodeTickRequests.set(node.id, 0);
                this.nodeTickErrors.set(node.id, 0);

                const cbState = this.circuitBreakerState.get(node.id);
                if (cbState === 'open') {
                    const tripTick = this.circuitBreakerTripTick.get(node.id) ?? 0;
                    if (this.tick - tripTick >= 30) {
                        this.circuitBreakerState.set(node.id, 'half-open');
                    }
                }
            }

            // LB Health checks
            for (const [lbId, removed] of this.lbRemovedBackends) {
                const lbNode = this.nodeMap.get(lbId);
                if (!lbNode) continue;
                const interval = (lbNode.specificConfig as any).healthCheckInterval ?? 5;
                const conns = this.connectionsBySource.get(lbId) ?? [];

                for (const conn of conns) {
                    const targetId = conn.targetId;
                    const hist = this.nodeHistory.get(targetId) ?? [];
                    let totalReqs = 0; let totalErrs = 0;
                    for (const h of hist) { totalReqs += h.reqs; totalErrs += h.errs; }
                    const currErrRate = totalReqs > 0 ? totalErrs / totalReqs : 0;

                    const key = `${lbId}_${targetId}`;
                    let consecutive = this.lbBackendConsecutiveHighErrors.get(key) ?? 0;
                    if (currErrRate > 0.5 || this.nodeMap.get(targetId)?.sharedConfig.chaos?.nodeFailure) {
                        consecutive++;
                    } else {
                        consecutive = 0;
                    }
                    this.lbBackendConsecutiveHighErrors.set(key, consecutive);

                    if (consecutive >= interval) {
                        removed.add(targetId);
                    } else if (consecutive === 0) {
                        removed.delete(targetId);
                    }
                }
            }
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

    private checkCircuitBreakerTrip(targetId: string, nodeFailure: boolean) {
        const hist = this.nodeHistory.get(targetId) ?? [];
        let totalReqs = this.nodeTickRequests.get(targetId) ?? 0;
        let totalErrs = this.nodeTickErrors.get(targetId) ?? 0;
        for (const h of hist) { totalReqs += h.reqs; totalErrs += h.errs; }

        if (nodeFailure || (totalReqs > 0 && totalErrs / totalReqs > 0.5)) {
            if (this.circuitBreakerState.get(targetId) !== 'open') {
                this.circuitBreakerState.set(targetId, 'open');
                this.circuitBreakerTripTick.set(targetId, this.tick);
            }
        }
    }

    private attemptCircuitBreakerRecovery(targetId: string, isError: boolean) {
        if (this.circuitBreakerState.get(targetId) === 'half-open' && !isError) {
            this.circuitBreakerState.set(targetId, 'closed');
        }
    }

    // ── Spawn ──

    private spawnFromNode(nodeId: string, count: number, traceId?: string, parentParticle?: RequestParticle, readWriteOverride?: ReadWrite) {
        const outConns = this.connectionsBySource.get(nodeId) ?? [];
        const node = this.nodeMap.get(nodeId);
        if (!node) return;

        const nodeType = node.type;

        if (outConns.length === 0 && nodeType !== 'cache' && nodeType !== 'cdn') {
            if (traceId) {
                this.addTraceEvent(traceId, {
                    nodeId,
                    nodeName: node.name,
                    nodeType,
                    action: 'no downstream — request terminated',
                    timestamp: this.tick,
                    method: parentParticle?.method,
                    readWrite: parentParticle?.readWrite,
                });
                this.finalizeTrace(traceId, true);
            }
            return;
        }

        this.nodeRequestCount.set(nodeId, (this.nodeRequestCount.get(nodeId) ?? 0) + count);

        if (nodeType === 'load_balancer') {
            this.spawnFromLB(node, outConns, count, traceId, parentParticle);
        } else if (nodeType === 'proxy') {
            this.spawnFromProxy(node, outConns, count, traceId, parentParticle);
        } else if (nodeType === 'cache' || nodeType === 'cdn') {
            this.spawnFromCache(node, outConns, count, traceId, parentParticle);
        } else if (nodeType === 'api_gateway') {
            const allowance = this.apiGatewayAllowanceRemaining.get(node.id) ?? 0;
            const allowed = Math.min(count, Math.max(0, allowance));
            this.apiGatewayAllowanceRemaining.set(node.id, allowance - allowed);
            this.apiGatewayDropped.set(node.id, (this.apiGatewayDropped.get(node.id) ?? 0) + (count - allowed));
            if (traceId) {
                const rw = parentParticle?.readWrite;
                const action = allowed > 0 ? `forwarded ${parentParticle?.method ?? ''} request`.trim() : 'rate limited (dropped)';
                this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action, timestamp: this.tick, method: parentParticle?.method, readWrite: rw });
                if (allowed === 0) {
                    this._tracedArrivalThisStep = true;
                    this.finalizeTrace(traceId, false);
                    return;
                }
            }
            for (const conn of outConns) {
                this.emitParticle(conn, allowed, undefined, traceId, parentParticle, readWriteOverride);
            }
        } else if (nodeType === 'app_server') {
            const hasCache = outConns.some((c) => this.nodeMap.get(c.targetId)?.type === 'cache');
            const hasDb = outConns.some((c) => {
                const t = this.nodeMap.get(c.targetId)?.type;
                return t === 'database_sql' || t === 'database_nosql';
            });

            if (hasCache && hasDb) {
                const cacheConn = outConns.find((c) => this.nodeMap.get(c.targetId)?.type === 'cache')!;
                const cacheNode = this.nodeMap.get(cacheConn.targetId)!;
                const cacheHitRate = this.getCacheHitRate(cacheNode);

                const dbConns = outConns.filter((c) => {
                    const t = this.nodeMap.get(c.targetId)?.type;
                    return t === 'database_sql' || t === 'database_nosql';
                });

                const rw = readWriteOverride ?? parentParticle?.readWrite ?? 'read';

                if (rw === 'read') {
                    const misses = Math.ceil(count * (1 - cacheHitRate));
                    if (traceId) {
                        this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `parallel cache routing`, timestamp: this.tick, method: parentParticle?.method, readWrite: rw });
                    }
                    if (count > 0) this.emitParticle(cacheConn, count, undefined, traceId, parentParticle, rw);
                    if (misses > 0) {
                        for (const dbConn of dbConns) {
                            this.emitParticle(dbConn, misses, undefined, traceId, parentParticle, rw);
                        }
                    }
                } else {
                    const writeStrategy = (cacheNode.specificConfig as Record<string, unknown>)?.writeStrategy as string | undefined ?? 'write-around';
                    if (traceId) {
                        this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `parallel cache write routing (${writeStrategy})`, timestamp: this.tick, method: parentParticle?.method, readWrite: rw });
                    }
                    if (writeStrategy === 'write-through') {
                        if (count > 0) this.emitParticle(cacheConn, count, undefined, traceId, parentParticle, rw);
                        if (count > 0) {
                            for (const dbConn of dbConns) {
                                this.emitParticle(dbConn, count, undefined, traceId, parentParticle, rw);
                            }
                        }
                    } else if (writeStrategy === 'write-behind') {
                        if (count > 0) this.emitParticle(cacheConn, count, undefined, traceId, parentParticle, rw);
                    } else { // write-around
                        if (count > 0) {
                            for (const dbConn of dbConns) {
                                this.emitParticle(dbConn, count, undefined, traceId, parentParticle, rw);
                            }
                        }
                    }
                }

                // emit to non-cache/non-db outConns
                for (const conn of outConns) {
                    const targetType = this.nodeMap.get(conn.targetId)?.type;
                    if (targetType !== 'cache' && targetType !== 'database_sql' && targetType !== 'database_nosql') {
                        this.emitParticle(conn, count, undefined, traceId, parentParticle, readWriteOverride);
                    }
                }
            } else {
                if (traceId) {
                    const targetNames = outConns.map((c) => this.nodeMap.get(c.targetId)?.name ?? c.targetId).join(', ');
                    this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `forwarded to ${targetNames}`, timestamp: this.tick, method: parentParticle?.method, readWrite: parentParticle?.readWrite });
                }
                for (const conn of outConns) {
                    this.emitParticle(conn, count, undefined, traceId, parentParticle, readWriteOverride);
                }
            }
        } else {
            if (traceId) {
                const targetNames = outConns.map((c) => this.nodeMap.get(c.targetId)?.name ?? c.targetId).join(', ');
                this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `forwarded to ${targetNames}`, timestamp: this.tick, method: parentParticle?.method, readWrite: parentParticle?.readWrite });
            }
            for (const conn of outConns) {
                this.emitParticle(conn, count, undefined, traceId, parentParticle, readWriteOverride);
            }
        }
    }

    private spawnFromLB(node: CanvasNode, outConnsRaw: CanvasConnection[], count: number, traceId?: string, pp?: RequestParticle) {
        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string || 'round-robin';

        const removed = this.lbRemovedBackends.get(node.id) ?? new Set();
        const outConns = outConnsRaw.filter((c) => !removed.has(c.targetId));

        if (outConns.length === 0) return;

        const recordSent = (targetId: string, n: number) => {
            const m = this.lbSentRequests.get(node.id)!;
            m.set(targetId, (m.get(targetId) ?? 0) + n);
        };

        // Distribute count across connections based on the strategy
        // We use a baseline chunking so that large particle counts don't all hit a single node
        let targets: CanvasConnection[] = [];

        if (algo === 'weighted') {
            const bw = (node.specificConfig as Record<string, unknown>).backendWeights as Record<string, number> | undefined;
            const totalWeight = outConns.reduce((s, c) => s + (bw?.[c.targetId] ?? 1), 0);
            const useWeights = totalWeight > 0 && outConns.some((c) => (bw?.[c.targetId] ?? 1) > 0);

            if (traceId && count === 1) {
                let chosenConn: CanvasConnection | null = null;
                if (useWeights) {
                    let r = Math.random() * totalWeight;
                    for (const conn of outConns) {
                        const w = bw?.[conn.targetId] ?? 1;
                        if (r < w) {
                            chosenConn = conn;
                            break;
                        }
                        r -= w;
                    }
                    if (!chosenConn) chosenConn = outConns[outConns.length - 1];
                } else {
                    const idx = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
                    this.rrCounters.set(node.id, idx + 1);
                    chosenConn = outConns[idx];
                }
                this.emitParticle(chosenConn!, 1, undefined, traceId, pp);
                recordSent(chosenConn!.targetId, 1);

                const targetName = this.nodeMap.get(chosenConn!.targetId)?.name ?? chosenConn!.targetId;
                const methodStr = pp?.method ? ` ${pp.method}` : '';
                this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `routed${methodStr} to ${targetName} (${algo})`, timestamp: this.tick, method: pp?.method, readWrite: pp?.readWrite });
                return;
            } else if (useWeights) {
                targets = [...outConns];
                const frac = targets.map((c) => ({
                    conn: c,
                    w: bw?.[c.targetId] ?? 1,
                    base: Math.floor((count * ((bw?.[c.targetId] ?? 1) / totalWeight))),
                    remainder: 0,
                }));
                frac.forEach((f) => {
                    f.remainder = (count * (f.w / totalWeight)) - f.base;
                });
                let assigned = frac.reduce((s, f) => s + f.base, 0);
                frac.sort((a, b) => b.remainder - a.remainder);
                for (const f of frac) {
                    if (assigned >= count) break;
                    f.base += 1;
                    assigned += 1;
                }
                for (const f of frac) {
                    if (f.base > 0) {
                        this.emitParticle(f.conn, f.base, undefined, traceId, pp);
                        recordSent(f.conn.targetId, f.base);
                    }
                }
                return;
            }
        }

        // For round-robin, least-connections, random (or fallback from weighted)
        // If single traced request, pass it to one connection
        if (traceId && count === 1) {
            let chosenConn = outConns[0];
            if (algo === 'least-connections') {
                let minCount = Infinity;
                for (const conn of outConns) {
                    const active = this.nodeActiveCount.get(conn.targetId) ?? 0;
                    if (active < minCount) {
                        minCount = active;
                        chosenConn = conn;
                    }
                }
            } else if (algo === 'random') {
                chosenConn = outConns[Math.floor(Math.random() * outConns.length)];
            } else {
                const idx = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
                this.rrCounters.set(node.id, idx + 1);
                chosenConn = outConns[idx];
            }

            this.emitParticle(chosenConn, 1, undefined, traceId, pp);
            recordSent(chosenConn.targetId, 1);

            const targetName = this.nodeMap.get(chosenConn.targetId)?.name ?? chosenConn.targetId;
            const methodStr = pp?.method ? ` ${pp.method}` : '';
            this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `routed${methodStr} to ${targetName} (${algo})`, timestamp: this.tick, method: pp?.method, readWrite: pp?.readWrite });
            return;
        }

        // Divide count amongst outConns evenly to represent distributed load over this tick's batch
        const perConnBase = Math.floor(count / outConns.length);
        let remainder = count % outConns.length;

        let targetList = [...outConns];
        if (algo === 'random') {
            // Shuffle
            targetList = targetList.sort(() => Math.random() - 0.5);
        } else if (algo === 'least-connections') {
            targetList = targetList.sort((a, b) => (this.nodeActiveCount.get(a.targetId) ?? 0) - (this.nodeActiveCount.get(b.targetId) ?? 0));
        } else {
            // Round robin - start distributing remainder at the current RR index
            const startIndex = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
            this.rrCounters.set(node.id, startIndex + remainder);
            targetList = [...outConns.slice(startIndex), ...outConns.slice(0, startIndex)];
        }

        for (let i = 0; i < outConns.length; i++) {
            const conn = targetList[i];
            const toSend = perConnBase + (i < remainder ? 1 : 0);
            if (toSend > 0) {
                this.emitParticle(conn, toSend, undefined, traceId, pp);
                recordSent(conn.targetId, toSend);
            }
        }
    }

    private spawnFromProxy(node: CanvasNode, outConns: CanvasConnection[], count: number, traceId?: string, pp?: RequestParticle) {
        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string || 'round-robin';

        if (outConns.length === 0) return;

        const recordSent = (targetId: string, n: number) => {
            const m = this.proxySentRequests.get(node.id)!;
            m.set(targetId, (m.get(targetId) ?? 0) + n);
        };

        // Distribute proxy batched requests equally. Proxy doesn't have weighting.
        if (traceId && count === 1) {
            let chosenConn: CanvasConnection;
            switch (algo) {
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
                    break;
                }
                case 'random': {
                    chosenConn = outConns[Math.floor(Math.random() * outConns.length)];
                    break;
                }
                default: {
                    const idx = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
                    this.rrCounters.set(node.id, idx + 1);
                    chosenConn = outConns[idx];
                    break;
                }
            }
            this.emitParticle(chosenConn, count, undefined, traceId, pp);
            recordSent(chosenConn.targetId, count);

            const targetName = this.nodeMap.get(chosenConn.targetId)?.name ?? chosenConn.targetId;
            const methodStr = pp?.method ? ` ${pp.method}` : '';
            this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `routed via proxy to ${targetName} (${algo})`, timestamp: this.tick, method: pp?.method, readWrite: pp?.readWrite });
            return;
        }

        const perConnBase = Math.floor(count / outConns.length);
        let remainder = count % outConns.length;

        let targetList = [...outConns];
        if (algo === 'random') {
            targetList = targetList.sort(() => Math.random() - 0.5);
        } else if (algo === 'least-connections') {
            targetList = targetList.sort((a, b) => (this.nodeActiveCount.get(a.targetId) ?? 0) - (this.nodeActiveCount.get(b.targetId) ?? 0));
        } else {
            const startIndex = (this.rrCounters.get(node.id) ?? 0) % outConns.length;
            this.rrCounters.set(node.id, startIndex + remainder);
            targetList = [...outConns.slice(startIndex), ...outConns.slice(0, startIndex)];
        }

        for (let i = 0; i < outConns.length; i++) {
            const conn = targetList[i];
            const toSend = perConnBase + (i < remainder ? 1 : 0);
            if (toSend > 0) {
                this.emitParticle(conn, toSend, undefined, traceId, pp);
                recordSent(conn.targetId, toSend);
            }
        }
    }

    private spawnFromCache(node: CanvasNode, outConns: CanvasConnection[], count: number, traceId?: string, pp?: RequestParticle) {
        const rw = pp?.readWrite ?? 'read';
        const isCdn = node.type === 'cdn';
        const c = node.specificConfig as Record<string, unknown>;
        let writeStrategy = (c.writeStrategy as string) ?? 'write-around';
        if (node.type === 'cache' && this.getCachePlacement(node.id) === 'edge') {
            writeStrategy = 'write-around';
        }

        // CDN: writes always pass through (no cache involvement)
        // Cache: writes branch on writeStrategy
        if (rw === 'write' && !isCdn) {
            this.handleCacheWrite(node, outConns, count, traceId, pp, writeStrategy);
            return;
        }

        // CDN writes: pass through to origin
        if (rw === 'write' && isCdn) {
            if (traceId) {
                this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `CDN pass-through (${pp?.method ?? 'POST'}, not cacheable)`, timestamp: this.tick, method: pp?.method, readWrite: rw });
            }
            for (const conn of outConns) {
                this.emitParticle(conn, count, undefined, traceId, pp);
            }
            return;
        }

        const sim = this.cacheSimulators.get(node.id);
        const useConfiguredHitRate = typeof c.hitRate === 'number';

        let hits = 0;
        let misses = 0;

        // Traced with path: use path as cache key
        if (traceId && pp?.path && sim) {
            if (sim.hasKey(pp.path)) {
                hits = 1;
                sim.recordHit(pp.path);
            } else {
                misses = 1;
                sim.recordMiss(pp.path);
            }
        } else {
            // Non-traced or no path: compute hits/misses realistically
            if (useConfiguredHitRate) {
                const hitRate = Math.max(0, Math.min(1, c.hitRate as number));
                misses = Math.round(count * (1 - hitRate));
                hits = count - misses;
                if (sim) {
                    for (let i = 0; i < hits; i++) sim.recordHit(CacheEntrySimulator.randomKeyFromPool());
                    for (let i = 0; i < misses; i++) sim.recordMiss(CacheEntrySimulator.randomKeyFromPool());
                }
            } else if (sim) {
                // Entry-based simulation: sample keys realistically
                for (let i = 0; i < count; i++) {
                    const key = CacheEntrySimulator.randomKeyFromPool();
                    if (sim.hasKey(key)) {
                        hits++;
                        sim.recordHit(key);
                    } else {
                        misses++;
                        sim.recordMiss(key);
                    }
                }
            } else {
                // Fallback purely mathematically
                const hitRate = this.getCacheHitRate(node);
                misses = Math.round(count * (1 - hitRate));
                hits = count - misses;
            }
        }

        this.cacheHits.set(node.id, (this.cacheHits.get(node.id) ?? 0) + hits);
        this.cacheMisses.set(node.id, (this.cacheMisses.get(node.id) ?? 0) + misses);

        if (traceId) {
            const isHit = hits > misses || hits > 0;
            const readStrategy = (c.readStrategy as string) ?? 'cache-aside';
            const strategyLabel = readStrategy === 'read-through' ? ' (read-through)' : '';
            const key = pp?.path || CacheEntrySimulator.randomKeyFromPool();
            const action = isHit
                ? `cache HIT${strategyLabel} on ${key}`
                : `cache MISS${strategyLabel} on ${key} -> forwarded to downstream`;
            this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action, timestamp: this.tick, method: pp?.method, readWrite: rw });

            if (isHit || outConns.length === 0) {
                this._tracedArrivalThisStep = true;
                this.finalizeBranch(traceId, true);
                return;
            }
            for (const conn of outConns) {
                this.emitParticle(conn, misses || 1, '#f59e0b', traceId, pp);
            }
            return;
        }

        if (outConns.length === 0 || misses === 0) return;

        // Non-traced: throttle particle emission
        const realHitRate = count > 0 ? hits / count : 0;
        const missRate = 1 - realHitRate;
        const k = Math.max(1, Math.round(1 / (missRate || 0.0001)));
        let acc = this.cacheDownstreamAccumulator.get(node.id) ?? 0;
        let batchCount = this.cacheDownstreamBatchCount.get(node.id) ?? 0;
        acc += misses;
        batchCount += 1;
        this.cacheDownstreamAccumulator.set(node.id, acc);
        this.cacheDownstreamBatchCount.set(node.id, batchCount);

        if (batchCount >= k && acc > 0) {
            for (const conn of outConns) {
                this.emitParticle(conn, acc, '#f59e0b', undefined, pp);
            }
            this.cacheDownstreamAccumulator.set(node.id, 0);
            this.cacheDownstreamBatchCount.set(node.id, 0);
        }
    }

    /** Handle write requests arriving at a Cache node */
    private handleCacheWrite(
        node: CanvasNode, outConns: CanvasConnection[], count: number,
        traceId?: string, pp?: RequestParticle, writeStrategy?: string,
    ) {
        const sim = this.cacheSimulators.get(node.id);
        const key = (traceId && pp?.path) ? pp.path : (sim ? CacheEntrySimulator.randomKeyFromPool() : '/unknown');

        switch (writeStrategy) {
            case 'write-through': {
                if (sim) sim.recordHit(key);
                if (traceId) {
                    const trace = this.activeTraces.get(traceId);
                    if (trace) {
                        trace.pendingBranches += 1;
                        this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `cache updated via write-through on ${key}`, timestamp: this.tick, method: pp?.method, readWrite: 'write', status: 'ok' });
                        this.finalizeBranch(traceId, true);
                    }
                }
                for (const conn of outConns) {
                    this.emitParticle(conn, count, undefined, traceId, pp);
                }
                break;
            }
            case 'write-behind': {
                if (sim) sim.recordHit(key);
                if (traceId) {
                    this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `write-behind: cached on ${key}, DB write is async. Subsequent reads may return stale data.`, timestamp: this.tick, method: pp?.method, readWrite: 'write', status: 'ok' });
                    this._tracedArrivalThisStep = true;
                    this.finalizeBranch(traceId, true);
                }
                break;
            }
            case 'write-around':
            default: {
                if (traceId) {
                    this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `write-around: ${key} bypassed, existing cache entry for ${key} may be stale`, timestamp: this.tick, method: pp?.method, readWrite: 'write' });
                }
                for (const conn of outConns) {
                    this.emitParticle(conn, count, undefined, traceId, pp);
                }
                break;
            }
        }
    }

    // ── Process arrival ──

    private processArrival(particle: RequestParticle) {
        const targetNode = this.nodeMap.get(particle.targetId);
        if (!targetNode) return;

        this.nodeTickRequests.set(particle.targetId, (this.nodeTickRequests.get(particle.targetId) ?? 0) + particle.count);

        const conn = this.connectionMap.get(particle.connectionId);
        const sourceNode = conn ? this.nodeMap.get(conn.sourceId) : undefined;
        const lossRate = conn ? (PROTOCOL_FACTORS[conn.protocol]?.packetLossRate ?? 0) : 0;

        // --- CHAOS ENGINEERING: Network Partition ---
        const isPartitioned = targetNode.sharedConfig.chaos?.networkPartition || sourceNode?.sharedConfig.chaos?.networkPartition;

        if (isPartitioned || (lossRate > 0 && Math.random() < lossRate)) {
            this.nodeErrorCount.set(
                particle.targetId,
                (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count,
            );
            this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);
            this.checkCircuitBreakerTrip(particle.targetId, false);

            const prev = this.nodeActiveCount.get(particle.targetId) ?? 0;
            this.nodeActiveCount.set(particle.targetId, Math.max(0, prev - 1));

            if (particle.traceId) {
                this._tracedArrivalThisStep = true;
                this.addTraceEvent(particle.traceId, {
                    nodeId: targetNode.id,
                    nodeName: targetNode.name,
                    nodeType: targetNode.type,
                    action: isPartitioned ? `network partition: connection dropped` : `packet loss`,
                    timestamp: this.tick,
                    method: particle.method,
                    readWrite: particle.readWrite,
                    status: 'error',
                });
                this.finalizeBranch(particle.traceId, false);
            }
            return;
        }

        // Decrement active count
        const prev = this.nodeActiveCount.get(particle.targetId) ?? 0;
        this.nodeActiveCount.set(particle.targetId, Math.max(0, prev - 1));

        // --- CHAOS ENGINEERING: Node Failure ---
        if (targetNode.sharedConfig.chaos?.nodeFailure) {
            this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);
            this.checkCircuitBreakerTrip(particle.targetId, true);

            if (targetNode.type === 'cache') {
                const outConns = this.connectionsBySource.get(targetNode.id) ?? [];
                const dbConn = outConns.find((c) => {
                    const t = this.nodeMap.get(c.targetId)?.type;
                    return t === 'database_sql' || t === 'database_nosql';
                });
                if (dbConn) {
                    this.nodeRecentArrivals.set(particle.targetId, (this.nodeRecentArrivals.get(particle.targetId) ?? 0) + particle.count);
                    this.nodeRequestCount.set(particle.targetId, (this.nodeRequestCount.get(particle.targetId) ?? 0) + particle.count);

                    if (particle.traceId) {
                        this.addTraceEvent(particle.traceId, {
                            nodeId: targetNode.id,
                            nodeName: targetNode.name,
                            nodeType: targetNode.type,
                            action: `Cache node failure — all traffic rerouting directly to DB. DB receiving full App Server RPS.`,
                            timestamp: this.tick,
                            method: particle.method,
                            readWrite: particle.readWrite,
                            status: 'warning',
                        });
                    }
                    this.emitParticle(dbConn, particle.count, undefined, particle.traceId, particle);
                    return;
                }
            }

            this.nodeErrorCount.set(particle.targetId, (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count);
            this.nodeRecentArrivals.set(particle.targetId, (this.nodeRecentArrivals.get(particle.targetId) ?? 0) + particle.count);
            this.nodeRequestCount.set(particle.targetId, (this.nodeRequestCount.get(particle.targetId) ?? 0) + particle.count);

            if (particle.traceId) {
                this._tracedArrivalThisStep = true;
                this.addTraceEvent(particle.traceId, {
                    nodeId: targetNode.id,
                    nodeName: targetNode.name,
                    nodeType: targetNode.type,
                    action: `node failure: connection refused`,
                    timestamp: this.tick,
                    method: particle.method,
                    readWrite: particle.readWrite,
                    status: 'error',
                });
                this.finalizeBranch(particle.traceId, false);
            }
            return;
        }

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
            this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);
            this.checkCircuitBreakerTrip(particle.targetId, false);
        } else {
            this.attemptCircuitBreakerRecovery(particle.targetId, false);
        }

        // Add latency (node processing + protocol overhead + payload + write overhead)
        const protocolOverhead = conn ? (PROTOCOL_FACTORS[conn.protocol]?.overheadMs ?? 0) : 0;
        let latency = this.getNodeLatency(targetNode, currentLoadRps, capacity) + protocolOverhead;

        // --- CHAOS ENGINEERING: Latency Injection ---
        if (targetNode.sharedConfig.chaos?.latencyInjectionMs) {
            latency += targetNode.sharedConfig.chaos.latencyInjectionMs;
        }

        // Payload size multiplier
        const payloadMult = PAYLOAD_LATENCY_MULTIPLIER[particle.payloadSize ?? 'small'] ?? 1.0;
        latency *= payloadMult;

        // Write overhead for storage nodes (+20% for DB, +100% for object store)
        const rw = particle.readWrite ?? 'read';
        if (rw === 'write') {
            if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
                latency *= 1.2;
            } else if (targetNode.type === 'object_store') {
                latency *= 2.0;
            }
        }

        // Connection pooling: when particle came from a proxy with connectionPooling enabled,
        // reduce downstream hop latency by ~20% (reused connections avoid handshake overhead)
        if (conn) {
            const sourceNode = this.nodeMap.get(conn.sourceId);
            if (sourceNode?.type === 'proxy') {
                const sc = (sourceNode.specificConfig as Record<string, unknown>);
                if (sc?.connectionPooling === true) {
                    latency *= 0.8;
                }
            }
        }

        this.nodeLatencySum.set(
            particle.targetId,
            (this.nodeLatencySum.get(particle.targetId) ?? 0) + latency * particle.count,
        );

        // Message queue: track enqueued (arrivals at queue; MQ ignores readWrite)
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
                const methodStr = particle.method ? ` ${particle.method}` : '';
                const rwStr = rw === 'write' ? ' (write)' : '';
                const errorNote = isOverloaded ? ' — DB write failed; cache may be inconsistent' : '';
                this.addTraceEvent(particle.traceId, {
                    nodeId: targetNode.id,
                    nodeName: targetNode.name,
                    nodeType: targetNode.type,
                    action: `${targetNode.type === 'message_queue' ? 'enqueued' : 'processed'}${methodStr} request${rwStr}${errorNote}`,
                    timestamp: this.tick,
                    method: particle.method,
                    readWrite: rw,
                    latencyMs: Math.round(latency),
                    status: isOverloaded ? 'error' : 'ok',
                });
                this.finalizeBranch(particle.traceId, !isOverloaded);
            } else {
                this.spawnFromNode(particle.targetId, particle.count, particle.traceId, particle);
            }
        } else if (!isLeaf) {
            this.spawnFromNode(particle.targetId, particle.count, undefined, particle);
        }
    }

    // ── Helpers ──

    private emitParticle(
        conn: CanvasConnection,
        count: number,
        colorOverride?: string,
        traceId?: string,
        parentParticle?: RequestParticle,
        readWriteOverride?: ReadWrite,
    ) {
        const id = `p${nextParticleId++}`;
        const rw = readWriteOverride ?? parentParticle?.readWrite;
        let color: string;
        if (traceId) {
            color = rw === 'write' ? '#f59e0b' : '#eab308';
        } else if (rw === 'write') {
            color = colorOverride ?? '#f97316';
        } else if (rw === 'read') {
            color = colorOverride ?? '#3b82f6';
        } else {
            color = colorOverride ?? '#22d3ee';
        }
        this.particles.push({
            id,
            connectionId: conn.id,
            t: 0,
            count,
            color,
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            traceId,
            method: parentParticle?.method,
            readWrite: rw,
            payloadSize: parentParticle?.payloadSize,
            path: parentParticle?.path,
        });

        this.nodeActiveCount.set(
            conn.targetId,
            (this.nodeActiveCount.get(conn.targetId) ?? 0) + 1,
        );
    }

    private getClientRps(node: CanvasNode): number {
        const rps = (node.specificConfig as Record<string, unknown>).requestsPerSecond;
        let baseRps = typeof rps === 'number' && rps > 0 ? rps : 1000;

        // --- CHAOS ENGINEERING: Load Spike ---
        if (node.sharedConfig.chaos?.loadSpikeMultiplier) {
            baseRps *= node.sharedConfig.chaos.loadSpikeMultiplier;
        }

        return baseRps;
    }

    private getClientReadWriteRatio(node: CanvasNode): number {
        const ratio = (node.specificConfig as Record<string, unknown>).readWriteRatio;
        if (typeof ratio !== 'number') return 0.8;
        return Math.max(0, Math.min(1, ratio));
    }

    private sampleReadWrite(node: CanvasNode): ReadWrite {
        const ratio = this.getClientReadWriteRatio(node);
        return Math.random() < ratio ? 'read' : 'write';
    }

    /** Cache topology: edge (CDN→Cache), backend (App→Cache→DB), blob (App→Cache→Object Store), l2 (Cache→Cache). */
    private getCachePlacement(nodeId: string): 'edge' | 'backend' | 'blob' | 'l2' {
        // Order is intentional: edge and blob take precedence over l2.
        // A cache with both CDN and another cache as upstream is treated as edge.
        const inbound = this.connectionsByTarget.get(nodeId) ?? [];
        const outbound = this.connectionsBySource.get(nodeId) ?? [];
        const upstreamTypes = new Set(inbound.map((c) => this.nodeMap.get(c.sourceId)?.type));
        const downstreamTypes = new Set(outbound.map((c) => this.nodeMap.get(c.targetId)?.type));

        if (upstreamTypes.has('cdn')) return 'edge';
        if (downstreamTypes.has('object_store')) return 'blob';
        if (upstreamTypes.has('cache')) return 'l2';
        return 'backend';
    }

    private getCacheHitRate(node: CanvasNode): number {
        if (node.sharedConfig.chaos?.nodeFailure) return 0;

        const c = node.specificConfig as Record<string, unknown>;
        if (typeof c.hitRate === 'number') return Math.max(0, Math.min(1, c.hitRate));

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
        const incomingConns = this.connectionsByTarget.get(node.id) ?? [];
        const avgMultiplier =
            incomingConns.length > 0
                ? incomingConns.reduce(
                    (sum, c) => sum + (PROTOCOL_FACTORS[c.protocol]?.capacityMultiplier ?? 1),
                    0,
                ) / incomingConns.length
                : 1;
        return instances * rps * avgMultiplier;
    }

    private getNodeLatency(node: CanvasNode, load: number, capacity: number): number {
        const utilization = Math.min(load / Math.max(capacity, 1), 1);
        const baseLat: Partial<Record<CanvasComponentType, number>> = {
            client: 0,
            cdn: 2,
            load_balancer: 1,
            proxy: 1,
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
                        placement: this.getCachePlacement(node.id),
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
                case 'proxy': {
                    const sentMap = this.proxySentRequests.get(node.id);
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
                        kind: 'proxy',
                        algorithm: (c.algorithm as string) ?? 'round-robin',
                        connectionPooling: (c.connectionPooling as boolean) ?? true,
                        maxConnections: (c.maxConnections as number) ?? 500,
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
                        readWriteRatio: this.getClientReadWriteRatio(node),
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

        const readParticles = this.particles.filter((p) => (p.readWrite ?? 'read') === 'read').length;
        const writeParticles = this.particles.filter((p) => p.readWrite === 'write').length;

        return {
            rps: Math.round(currentClientRps),
            avgLatencyMs: totalRequests > 0
                ? Math.round(totalLatency / totalRequests * 100) / 100
                : 0,
            errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
            estimatedCostMonthly: Math.round(cost),
            readParticles,
            writeParticles,
            nodeMetrics,
        };
    }
}

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
import { classifyEdges, EdgeSemantics, ChaosPolicy, isMultiDBWrite } from './TopologyInference';
import { MessageQueueModel } from './models/MessageQueueModel';
import { LoadBalancerModel } from './models/LoadBalancerModel';
import { CacheModel } from './models/CacheModel';
import { DBReplicationModel } from './models/DatabaseModel';

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

    /** Clear all entries (e.g. chaos.cacheFlush). */
    clear(): void {
        this.entries.clear();
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
    parentTraceEventId?: string; // for DAG: parent event id so siblings share same parent
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

    // Circuit Breakers & Cascading Failures
    public circuitBreakerState: Map<string, 'closed' | 'open' | 'half-open'> = new Map();
    private circuitBreakerTripTick: Map<string, number> = new Map();
    private nodeTickRequests: Map<string, number> = new Map();
    private nodeTickErrors: Map<string, number> = new Map();
    private nodeHistory: Map<string, { reqs: number; errs: number }[]> = new Map();

    // Autoscaling active instances
    private dynamicInstances: Map<string, number> = new Map();

    private nodeWriteRequestCount = new Map<string, number>();
    private nodeWriteErrorCount = new Map<string, number>();

    // Inspector: cache/CDN hits and misses, cache entry simulator
    private cacheHits: Map<string, number> = new Map();
    private cacheMisses: Map<string, number> = new Map();
    private cacheSimulators: Map<string, CacheEntrySimulator> = new Map();
    public cacheModels: Map<string, CacheModel> = new Map();
    /** Tick at which we last applied chaos.cacheFlush per node (so we flush once per activation). */
    private cacheFlushAppliedAtTick: Map<string, number> = new Map();
    // Throttle downstream particles so visual density reflects hit rate
    private cacheDownstreamAccumulator: Map<string, number> = new Map();
    private cacheDownstreamBatchCount: Map<string, number> = new Map();

    // LB: requests sent per backend (nodeId -> targetId -> count)
    private lbSentRequests: Map<string, Map<string, number>> = new Map();
    // Proxy: requests sent per backend (nodeId -> targetId -> count) — separate from LB to avoid naming confusion
    private proxySentRequests: Map<string, Map<string, number>> = new Map();

    // Message Queue State
    // Rather than raw Maps, we store MessageQueueModel instances
    public mqModels = new Map<string, MessageQueueModel>();
    public mqProcessAccumulator = new Map<string, number>(); // Stores fractional processed messages to emit
    public previousNodeFailure = new Map<string, boolean>(); // Tracks node fail state for MQ at-least-once replay

    // API Gateway: allowance per step (reset each step), dropped cumulative
    private apiGatewayAllowanceRemaining: Map<string, number> = new Map();
    private apiGatewayDropped: Map<string, number> = new Map();

    // Load Balancers & Proxies
    public lbModels = new Map<string, LoadBalancerModel>();

    // Databases
    public dbModels = new Map<string, DBReplicationModel>();

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

    /** Write-behind: delayed DB writes fired after writeBehindDelayMs */
    private scheduledWriteBehindWrites: Array<{
        dueTick: number;
        conn: CanvasConnection;
        count: number;
        traceId?: string;
        pp?: RequestParticle;
        writeBehindDelayMs: number;
    }> = [];

    // Distributed Transactions Diagnostics
    private multiDbNoneWarning = new Set<string>();
    private twoPhaseCoordinatorBlocked = new Set<string>();

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
            this.nodeWriteRequestCount.set(node.id, 0); // Initialize new map
            this.nodeWriteErrorCount.set(node.id, 0);   // Initialize new map
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
                this.cacheModels.set(node.id, new CacheModel(node));
            }
            if (node.type === 'load_balancer') {
                this.lbSentRequests.set(node.id, new Map());
            }
            if (node.type === 'proxy') {
                this.proxySentRequests.set(node.id, new Map());
            }
            if (node.type === 'message_queue') {
                this.mqModels.set(node.id, new MessageQueueModel(node));
            }
            if (node.type === 'api_gateway') {
                this.apiGatewayDropped.set(node.id, 0);
            }
            if (node.type === 'database_sql' || node.type === 'database_nosql') {
                this.dbModels.set(node.id, new DBReplicationModel(node));
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
        this.clientAccumulators.clear();
        this.nodeActiveCount.clear();
        this.nodeRecentArrivals.clear();
        this.nodeRpsEma.clear();
        this.rpsAccumulator = 0;
        this.nodeRequestCount.clear();
        this.nodeErrorCount.clear();
        this.nodeLatencySum.clear();
        this.nodeWriteRequestCount.clear();
        this.nodeWriteErrorCount.clear();
        this.cacheHits.clear();
        this.cacheMisses.clear();
        this.cacheSimulators.clear();
        this.cacheModels.clear();
        this.cacheFlushAppliedAtTick.clear();
        this.lbSentRequests.clear();
        this.proxySentRequests.clear();
        this.mqModels.clear(); // Clear the MessageQueueModels
        this.mqProcessAccumulator.clear();
        this.previousNodeFailure.clear();

        this.apiGatewayAllowanceRemaining.clear();
        this.apiGatewayDropped.clear();

        this.dbModels.clear();
        for (const node of this.nodes) {
            if (node.type === 'database_sql' || node.type === 'database_nosql') {
                this.dbModels.set(node.id, new DBReplicationModel(node));
            }
        }

        this.circuitBreakerState.clear();
        this.circuitBreakerTripTick.clear();
        this.nodeTickRequests.clear();
        this.nodeTickErrors.clear();
        this.nodeHistory.clear();
        this.lbModels.clear();
        this.dynamicInstances.clear();
        this.scheduledWriteBehindWrites = [];
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
                this.cacheModels.set(node.id, new CacheModel(node));
            }
            this.circuitBreakerState.set(node.id, 'closed');
            this.circuitBreakerTripTick.set(node.id, 0);
            this.nodeTickRequests.set(node.id, 0);
            this.nodeTickErrors.set(node.id, 0);
            this.nodeHistory.set(node.id, []);

            if (node.type === 'load_balancer') {
                this.lbSentRequests.set(node.id, new Map());
                this.lbModels.set(node.id, new LoadBalancerModel(node));
            }
            if (node.type === 'proxy') {
                this.proxySentRequests.set(node.id, new Map());
                this.lbModels.set(node.id, new LoadBalancerModel(node));
            }
            if (node.type === 'message_queue') {
                this.mqModels.set(node.id, new MessageQueueModel(node));
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

        // Advance cache simulators (for entry age / eviction) and cacheModels (for write-behind cleanup)
        for (const sim of this.cacheSimulators.values()) {
            sim.advanceTick();
        }
        for (const model of this.cacheModels.values()) {
            model.tickCleanup(this.tick);
        }
        // Advance DB compaction state (LSM-Tree periodic spikes)
        for (const [, dbModel] of this.dbModels) {
            const tickDurationMs = 100 / this.speed;
            dbModel.tickCompaction(this.tick, tickDurationMs);
        }
        // Reset API Gateway allowance this step (rate limit per second -> per dt)
        for (const node of this.nodes) {
            if (node.type === 'api_gateway') {
                const tc = node.sharedConfig.trafficControl;
                const limit = (tc?.rateLimiting && typeof tc.rateLimit === 'number') ? tc.rateLimit : 10000;
                this.apiGatewayAllowanceRemaining.set(node.id, limit * (cappedDt / 1000));
            }
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

        // 2b. Drain due write-behind DB writes
        const due = this.scheduledWriteBehindWrites.filter((w) => w.dueTick <= this.tick);
        this.scheduledWriteBehindWrites = this.scheduledWriteBehindWrites.filter((w) => w.dueTick > this.tick);
        for (const w of due) {
            this.emitParticle(w.conn, w.count, undefined, w.traceId, w.pp, 'write');
            if (w.traceId) {
                const cacheNode = this.nodeMap.get(w.conn.sourceId);
                this.addTraceEvent(w.traceId, {
                    nodeId: w.conn.sourceId,
                    nodeName: cacheNode?.name ?? '',
                    nodeType: 'cache',
                    action: `write-behind: async DB write fired after ${w.writeBehindDelayMs}ms delay`,
                    timestamp: this.tick,
                    readWrite: 'write',
                });
            }
        }

        // Advance message queue processing (drain by capacity)
        for (const node of this.nodes) {
            if (node.type !== 'message_queue') continue;
            const mqModel = this.mqModels.get(node.id);
            if (!mqModel) continue;

            // Find downstream consumers to determine pulling capacity
            const outEdges = this.connectionsBySource.get(node.id) ?? [];
            let totalConsumerCapacity = 0;
            for (const edge of outEdges) {
                const consumer = this.nodeMap.get(edge.targetId);
                if (consumer && consumer.type !== 'object_store' && consumer.type !== 'database_sql' && consumer.type !== 'database_nosql') {
                    // This is a simplification: assuming all non-storage downstream nodes are active consumers pulling from the queue.
                    const rawCap = (consumer.sharedConfig.scaling?.nodeCapacityRps as number ?? 1000) * (consumer.sharedConfig.scaling?.instances as number ?? 1);
                    totalConsumerCapacity += rawCap;
                }
            }

            // Fallback: If no consumers connected yet, consumerThroughput is 0 (queue builds up)
            const consumerThroughput = totalConsumerCapacity;

            // Allow specific config to override consumerGroupCount
            const sc = node.sharedConfig as any;
            const c = node.specificConfig as any;
            const consumerGroupCount = c?.consumerGroupCount ?? sc?.scaling?.consumerGroupCount ?? 1;

            const guarantee = c?.deliveryGuarantee;

            // At-least-once replay logic: check if any consumer just recovered
            if (guarantee === 'at-least-once') {
                for (const edge of outEdges) {
                    const consumerId = edge.targetId;
                    const consumerNode = this.nodeMap.get(consumerId);
                    const isFailingNow = !!consumerNode?.sharedConfig.chaos?.nodeFailure;
                    const wasFailing = this.previousNodeFailure.get(consumerId) ?? false;

                    if (wasFailing && !isFailingNow) {
                        // Consumer recovered! Replay 5% of all processed messages
                        const replayCount = Math.floor(mqModel.totalProcessed * 0.05);
                        if (replayCount > 0) {
                            mqModel.enqueue(replayCount);
                        }
                    }
                    this.previousNodeFailure.set(consumerId, isFailingNow);
                }
            }

            // Apply exactly-once throughput reduction (15% overhead for txn coordination)
            const effectiveConsumerThroughput = guarantee === 'exactly-once'
                ? consumerThroughput * 0.85
                : consumerThroughput;

            const processed = mqModel.dequeue(effectiveConsumerThroughput * (cappedDt / 1000), consumerGroupCount);

            // Accumulate fractional processed messages to emit whole particles
            let pendingEmit = this.mqProcessAccumulator.get(node.id) ?? 0;
            pendingEmit += processed;

            const wholeMessages = Math.floor(pendingEmit);
            if (wholeMessages > 0) {
                this.mqProcessAccumulator.set(node.id, pendingEmit - wholeMessages);

                const validConsumers = outEdges.filter(edge => {
                    const t = this.nodeMap.get(edge.targetId)?.type;
                    return t && t !== 'object_store' && t !== 'database_sql' && t !== 'database_nosql';
                });

                if (validConsumers.length > 0) {
                    const perConsumer = Math.ceil(wholeMessages / validConsumers.length);
                    for (const edge of validConsumers) {
                        this.emitParticle(edge, perConsumer, undefined, undefined, undefined, 'write');
                    }
                }
            } else {
                this.mqProcessAccumulator.set(node.id, pendingEmit);
            }
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

            // --- CHAOS ENGINEERING: Cache Flush ---
            for (const node of this.nodes) {
                if (node.type !== 'cache') continue;
                const cacheFlush = node.sharedConfig.chaos?.cacheFlush === true;
                if (!cacheFlush) {
                    this.cacheFlushAppliedAtTick.delete(node.id);
                    continue;
                }
                if (this.cacheFlushAppliedAtTick.has(node.id)) continue; // already flushed this activation
                const sim = this.cacheSimulators.get(node.id);
                if (sim) {
                    sim.clear();
                    // Reset entryCount on the node's metrics directly (handled by LiveComponentInspector mostly)
                }
                const cacheModel = this.cacheModels.get(node.id);
                if (cacheModel) {
                    cacheModel.flush(this.tick);
                }
                this.cacheHits.set(node.id, 0);
                this.cacheMisses.set(node.id, 0);
                this.cacheFlushAppliedAtTick.set(node.id, this.tick);
            }

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

                // --- AUTOSCALING (Task 2) ---
                if (node.type === 'app_server') {
                    const sc = node.specificConfig as Record<string, unknown>;
                    if (sc.autoScaling === true) {
                        const maxInstances = (sc.maxInstances as number) || 10;
                        const minInstances = (sc.minInstances as number) || 1;
                        let instances = this.dynamicInstances.get(node.id) ?? node.sharedConfig.scaling?.instances ?? 1;

                        const capacity = this.getNodeCapacity(node);
                        const rps = this.nodeRpsEma.get(node.id) ?? 0;

                        // Look at the history over the last ~1.5s (3 ticks of 500ms equivalent)
                        // If all 3 most recent entries were > 80% capacity, scale up.
                        if (hist.length >= 3) {
                            const lastThree = hist.slice(-3);
                            // Hist represents reqs/errs collected in the tick, so average reqs per tick ~ rps / (speed adjusted)
                            // A simpler proxy is: is current load rps > 80% of capacity consistently?
                            // nodeRpsEma updates every tick.
                            if (capacity > 0 && rps > capacity * 0.8) {
                                // "For 3+ consecutive ticks" we can track a custom counter, or infer from high rps.
                                // Quick heuristic: if the recent history requests represent high load.
                                // Let's simplify by using the RPS which represents averaged sustained load.
                                if (instances < maxInstances) {
                                    instances++;
                                    this.dynamicInstances.set(node.id, instances);
                                }
                            } else if (capacity > 0 && rps < capacity * 0.3) {
                                if (instances > minInstances) {
                                    instances--;
                                    this.dynamicInstances.set(node.id, instances);
                                }
                            }
                        }
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
            const dropped = count - allowed;
            if (dropped > 0) {
                this.nodeErrorCount.set(node.id, (this.nodeErrorCount.get(node.id) ?? 0) + dropped);
                this.apiGatewayDropped.set(node.id, (this.apiGatewayDropped.get(node.id) ?? 0) + dropped);
            }
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

                if (rw === 'write' && dbConns.length >= 2) {
                    const scApp = node.specificConfig as Record<string, unknown>;
                    if (scApp.distributedTransaction === 'none' || !scApp.distributedTransaction) {
                        this.multiDbNoneWarning.add(node.id);
                    }
                }

                if (rw === 'read') {
                    const misses = Math.ceil(count * (1 - cacheHitRate));
                    if (traceId) {
                        this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `parallel cache routing`, timestamp: this.tick, method: parentParticle?.method, readWrite: rw });
                    }
                    if (count > 0) this.emitParticle(cacheConn, count, undefined, traceId, parentParticle, rw);
                    if (misses > 0) {
                        const missesPerDb = Math.ceil(misses / dbConns.length);
                        for (const dbConn of dbConns) {
                            this.emitParticle(dbConn, missesPerDb, undefined, traceId, parentParticle, rw);
                        }
                    }
                } else {
                    const writeStrategy = (cacheNode.specificConfig as Record<string, unknown>)?.writeStrategy as string | undefined ?? 'write-around';
                    let parentEvtId: string | undefined;
                    if (traceId) {
                        const trace = this.activeTraces.get(traceId);
                        if (trace) {
                            parentEvtId = this.addTraceEvent(traceId, { nodeId, nodeName: node.name, nodeType, action: `parallel cache write routing (${writeStrategy})`, timestamp: this.tick, method: parentParticle?.method, readWrite: rw });
                            trace.pendingBranches += 1; // two branches: cache + db(s)
                        }
                    }
                    if (writeStrategy === 'write-through') {
                        if (count > 0) this.emitParticle(cacheConn, count, undefined, traceId, parentParticle, rw, parentEvtId);
                        if (count > 0) {
                            for (const dbConn of dbConns) {
                                this.emitParticle(dbConn, count, undefined, traceId, parentParticle, rw, parentEvtId);
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
        let lbModel = this.lbModels.get(node.id);
        if (!lbModel) {
            lbModel = new LoadBalancerModel(node);
            this.lbModels.set(node.id, lbModel);
            this.lbSentRequests.set(node.id, new Map());
        }

        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string || 'round-robin';
        const outConns = lbModel.getHealthyConnections(outConnsRaw);

        if (outConns.length === 0) return;

        const recordSent = (targetId: string, n: number) => {
            const m = this.lbSentRequests.get(node.id)!;
            m.set(targetId, (m.get(targetId) ?? 0) + n);
        };

        const bw = (node.specificConfig as Record<string, unknown>).backendWeights as Record<string, number> | undefined;

        // Route particles one by one for exact distribution, tracking in the model.
        // For traces, count is 1. If particle hash is needed, derive it.
        const hashBase = pp ? Math.abs(this.hashCode(pp.sourceId)) : Math.floor(Math.random() * 100);

        // Bulk non-traced: deterministic proportional split
        if (!traceId && algo === 'weighted' && bw) {
            const totalWeight = outConns.reduce((s, c) => s + (bw[c.targetId] ?? 1), 0);
            if (totalWeight > 0) {
                const fracs = outConns.map(c => ({
                    conn: c,
                    w: bw[c.targetId] ?? 1,
                    base: Math.floor(count * ((bw[c.targetId] ?? 1) / totalWeight)),
                    rem: 0
                }));
                fracs.forEach(f => f.rem = (count * (f.w / totalWeight)) - f.base);
                let assigned = fracs.reduce((s, f) => s + f.base, 0);
                fracs.sort((a, b) => b.rem - a.rem);
                for (const f of fracs) { if (assigned >= count) break; f.base++; assigned++; }
                for (const f of fracs) {
                    if (f.base > 0) { this.emitParticle(f.conn, f.base); recordSent(f.conn.targetId, f.base); }
                }
                return;
            }
        }

        // Map targets to counts for batch emission
        const targetCounts = new Map<CanvasConnection, number>();
        let tracedConn: CanvasConnection | null = null;

        for (let i = 0; i < count; i++) {
            const hash = (hashBase + i) % 10; // For ip-hash stickiness
            const selected = lbModel.selectBackend(node.id, algo, outConns, this.nodeActiveCount, bw, hash);
            if (selected) {
                targetCounts.set(selected, (targetCounts.get(selected) ?? 0) + 1);
                if (traceId && i === 0) tracedConn = selected;
            }
        }

        for (const [conn, toSend] of targetCounts.entries()) {
            this.emitParticle(conn, toSend, undefined, traceId && conn === tracedConn ? traceId : undefined, pp);
            recordSent(conn.targetId, toSend);

            if (traceId && conn === tracedConn) {
                const targetName = this.nodeMap.get(conn.targetId)?.name ?? conn.targetId;
                const methodStr = pp?.method ? ` ${pp.method}` : '';
                this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `routed${methodStr} to ${targetName} (${algo})`, timestamp: this.tick, method: pp?.method, readWrite: pp?.readWrite });
            }
        }
    }

    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    private spawnFromProxy(node: CanvasNode, outConnsRaw: CanvasConnection[], count: number, traceId?: string, pp?: RequestParticle) {
        let proxyModel = this.lbModels.get(node.id);
        if (!proxyModel) {
            proxyModel = new LoadBalancerModel(node);
            this.lbModels.set(node.id, proxyModel);
            this.proxySentRequests.set(node.id, new Map());
        }

        const algo = (node.specificConfig as Record<string, unknown>).algorithm as string || 'round-robin';
        const outConns = proxyModel.getHealthyConnections(outConnsRaw);

        if (outConns.length === 0) return;

        const recordSent = (targetId: string, n: number) => {
            const m = this.proxySentRequests.get(node.id)!;
            m.set(targetId, (m.get(targetId) ?? 0) + n);
        };

        const hashBase = pp ? Math.abs(this.hashCode(pp.sourceId)) : Math.floor(Math.random() * 100);
        const targetCounts = new Map<CanvasConnection, number>();
        let tracedConn: CanvasConnection | null = null;

        for (let i = 0; i < count; i++) {
            const hash = (hashBase + i) % 10;
            const selected = proxyModel.selectBackend(node.id, algo, outConns, this.nodeActiveCount, undefined, hash);
            if (selected) {
                targetCounts.set(selected, (targetCounts.get(selected) ?? 0) + 1);
                if (traceId && i === 0) tracedConn = selected;
            }
        }

        for (const [conn, toSend] of targetCounts.entries()) {
            this.emitParticle(conn, toSend, undefined, traceId && conn === tracedConn ? traceId : undefined, pp);
            recordSent(conn.targetId, toSend);

            if (traceId && conn === tracedConn) {
                const targetName = this.nodeMap.get(conn.targetId)?.name ?? conn.targetId;
                const methodStr = pp?.method ? ` ${pp.method}` : '';
                this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `routed via proxy to ${targetName} (${algo})`, timestamp: this.tick, method: pp?.method, readWrite: pp?.readWrite });
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
            // For CDN, only forward to direct successors (app servers or lbs), not to everything
            // In a real topology, CDN misses go to the next hop
            const targetConns = outConns.slice(0, 1); // Or better logic to pick the origin
            for (const conn of targetConns) {
                this.emitParticle(conn, count, undefined, traceId, pp);
            }
            return;
        }

        const sim = this.cacheSimulators.get(node.id);
        const cacheModel = this.cacheModels.get(node.id);
        const stampedePrevention = (c.stampedePrevention as string) ?? 'none';
        const useConfiguredHitRate = typeof c.hitRate === 'number';

        const isFlushed = cacheModel ? cacheModel.isFlushed(this.tick, stampedePrevention) : false;

        let hits = 0;
        let misses = 0;

        // Traced with path: use path as cache key
        if (traceId && pp?.path && sim) {
            if (!isFlushed && sim.hasKey(pp.path)) {
                const forceMiss = cacheModel?.consumeWriteAroundMiss(pp.path);
                if (forceMiss) {
                    misses = 1;
                    sim.recordMiss(pp.path);
                } else {
                    hits = 1;
                    sim.recordHit(pp.path);
                    if (writeStrategy === 'write-behind' && cacheModel && cacheModel.checkStaleRead(pp.path, this.tick)) {
                        cacheModel.recordStaleRead(1);
                    }
                }
            } else {
                misses = 1;
                sim.recordMiss(pp.path);
            }
        } else {
            // Non-traced or no path: compute hits/misses realistically
            if (useConfiguredHitRate) {
                const hitRate = isFlushed ? 0 : Math.max(0, Math.min(1, c.hitRate as number));
                // Per-request probability so every read updates counters and sim stays in sync
                for (let i = 0; i < count; i++) {
                    if (Math.random() < hitRate) {
                        hits++;
                        const key = CacheEntrySimulator.randomKeyFromPool();
                        if (sim) sim.recordHit(key);
                        if (writeStrategy === 'write-behind' && cacheModel && cacheModel.checkStaleRead(key, this.tick)) {
                            cacheModel.recordStaleRead(1);
                        }
                    } else {
                        misses++;
                        if (sim) sim.recordMiss(CacheEntrySimulator.randomKeyFromPool());
                    }
                }
            } else if (sim) {
                // Entry-based simulation: sample keys realistically
                let perKeyStaleReads = 0;
                for (let i = 0; i < count; i++) {
                    const key = CacheEntrySimulator.randomKeyFromPool();
                    const forceMiss = cacheModel?.consumeWriteAroundMiss(key);
                    if (forceMiss || isFlushed || !sim.hasKey(key)) {
                        misses++;
                        sim.recordMiss(key);
                    } else {
                        hits++;
                        sim.recordHit(key);
                        if (writeStrategy === 'write-behind' && cacheModel && cacheModel.checkStaleRead(key, this.tick)) {
                            cacheModel.recordStaleRead(1);
                            perKeyStaleReads++;
                        }
                    }
                }
                // Probabilistic stale read fallback: random key collisions are rare,
                // so approximate based on ratio of pending writes to pool size (24 keys)
                if (writeStrategy === 'write-behind' && cacheModel && hits > 0 && perKeyStaleReads === 0) {
                    const pendingCount = cacheModel.getPendingWriteCount();
                    if (pendingCount > 0) {
                        const staleProbability = Math.min(1, pendingCount / 24); // 24 = CACHE_KEY_POOL.length
                        const approxStale = Math.max(1, Math.round(hits * staleProbability));
                        cacheModel.recordStaleRead(approxStale);
                    }
                }
            } else {
                // Fallback purely mathematically
                const baseHitRate = this.getCacheHitRate(node);
                const hitRate = isFlushed ? 0 : baseHitRate;
                misses = Math.round(count * (1 - hitRate));
                hits = count - misses;
                if (writeStrategy === 'write-behind' && cacheModel && hits > 0) {
                    // Approximate stale reads based on global write volume vs pool size
                    // Since bulk writes don't use real keys, we just use a small ratio
                    // In a real system, the probability of hitting a pending write depends on
                    // write RPS, read RPS, and delay window. Here we approximate: 10% of hits might be stale.
                    cacheModel.recordStaleRead(Math.ceil(hits * 0.1));
                }
            }
        }

        // Unified probabilistic stale read check for write-behind:
        // Per-key checkStaleRead rarely collides with random keys, so use a probabilistic
        // approximation based on the ratio of pending write-behind keys to the key pool size.
        if (writeStrategy === 'write-behind' && cacheModel && hits > 0 && cacheModel.getStaleReadCount() === 0) {
            const pendingCount = cacheModel.getPendingWriteCount();
            if (pendingCount > 0) {
                const staleProbability = Math.min(1, pendingCount / 24); // 24 = CACHE_KEY_POOL.length
                const approxStale = Math.max(1, Math.round(hits * staleProbability));
                cacheModel.recordStaleRead(approxStale);
            }
        }

        let forwardToDb = misses;
        if (cacheModel && misses > 0 && node.type === 'cache') {
            cacheModel.recordMisses(misses, this.tick);
            const stampedeRes = cacheModel.applyStampedePrevention(stampedePrevention, misses, this.tick);
            forwardToDb = stampedeRes.forwardToDb;

            if (stampedeRes.queued > 0) {
                // Add latency penalty for queued requests (waiting on mutex)
                const waitMs = 50; // Approximated DB round trip
                this.nodeLatencySum.set(node.id, (this.nodeLatencySum.get(node.id) ?? 0) + (stampedeRes.queued * waitMs));
            }

            // Handle hotKeyReplication distribution
            if ((c.hotKeyReplication as boolean) === true) {
                const instances = node.sharedConfig.scaling?.instances ?? 1;
                forwardToDb = Math.max(1, Math.round(forwardToDb / instances));
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
            const staleRead = !!(isHit && writeStrategy === 'write-behind' && cacheModel && pp?.path && cacheModel.checkStaleRead(pp.path, this.tick));
            this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action, timestamp: this.tick, method: pp?.method, readWrite: rw, staleRead });

            if (isHit || outConns.length === 0) {
                this._tracedArrivalThisStep = true;
                this.finalizeBranch(traceId, true);
                return;
            }
            const targetConns = isCdn ? outConns.slice(0, 1) : outConns;
            for (const conn of targetConns) {
                this.emitParticle(conn, forwardToDb || 1, '#f59e0b', traceId, pp);
            }
            return;
        }

        if (outConns.length === 0 || forwardToDb === 0) return;

        // Non-traced: throttle particle emission
        const realHitRate = count > 0 ? hits / count : 0;
        const missRate = 1 - realHitRate;
        const k = Math.max(1, Math.round(1 / (missRate || 0.0001)));
        let acc = this.cacheDownstreamAccumulator.get(node.id) ?? 0;
        let batchCount = this.cacheDownstreamBatchCount.get(node.id) ?? 0;
        acc += forwardToDb;
        batchCount += 1;
        this.cacheDownstreamAccumulator.set(node.id, acc);
        this.cacheDownstreamBatchCount.set(node.id, batchCount);

        if (batchCount >= k && acc > 0) {
            const targetConns = isCdn ? outConns.slice(0, 1) : outConns;
            for (const conn of targetConns) {
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
        const cacheModel = this.cacheModels.get(node.id);
        const key = (traceId && pp?.path) ? pp.path : (sim ? CacheEntrySimulator.randomKeyFromPool() : '/unknown');

        switch (writeStrategy) {
            case 'write-through': {
                if (sim) sim.recordHit(key);
                if (traceId) {
                    const trace = this.activeTraces.get(traceId);
                    if (trace) {
                        trace.pendingBranches += 1;
                        this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `cache updated via write-through on ${key}`, timestamp: this.tick, method: pp?.method, readWrite: 'write', status: 'ok', parentId: pp?.parentTraceEventId });
                        this.finalizeBranch(traceId, true);
                    }
                }
                // Only emit to DB if chain topology (App Server did not already send to DB)
                const upstreamConns = this.connectionsByTarget.get(node.id) ?? [];
                const upstreamAppServer = upstreamConns
                    .map((c) => this.nodeMap.get(c.sourceId))
                    .find((n) => n?.type === 'app_server');
                const isParallel = upstreamAppServer
                    ? (this.connectionsBySource.get(upstreamAppServer.id) ?? []).some((c) => {
                        const t = this.nodeMap.get(c.targetId)?.type;
                        return t === 'database_sql' || t === 'database_nosql';
                    })
                    : false;
                if (!isParallel) {
                    for (const conn of outConns) {
                        this.emitParticle(conn, count, undefined, traceId, pp);
                    }
                }
                break;
            }
            case 'write-behind': {
                if (sim) sim.recordHit(key);
                if (cacheModel) {
                    const c = node.specificConfig as Record<string, unknown>;
                    const writeBehindDelayMs = (c.writeBehindDelayMs as number) ?? 500;
                    const delayTicks = Math.ceil(writeBehindDelayMs / (100 / this.speed));
                    cacheModel.recordWriteBehindWrite(key, this.tick, delayTicks);
                    for (const conn of outConns) {
                        this.scheduledWriteBehindWrites.push({
                            dueTick: this.tick + delayTicks,
                            conn,
                            count,
                            traceId,
                            pp,
                            writeBehindDelayMs,
                        });
                    }
                    if (traceId) {
                        const trace = this.activeTraces.get(traceId);
                        if (trace) trace.pendingBranches += outConns.length;
                    }
                }
                if (traceId) {
                    this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `write-behind: cached on ${key}, DB write is async. Subsequent reads may return stale data.`, timestamp: this.tick, method: pp?.method, readWrite: 'write', status: 'ok' });
                    this._tracedArrivalThisStep = true;
                    this.finalizeBranch(traceId, true);
                }
                break;
            }
            case 'write-around':
            default: {
                const N = Math.ceil(1 / (1 - Math.min(0.99, this.getCacheHitRate(node))));
                if (cacheModel) cacheModel.recordWriteAroundKey(key, N);
                if (traceId) {
                    this.addTraceEvent(traceId, { nodeId: node.id, nodeName: node.name, nodeType: node.type, action: `write-around: ${key} bypassed cache — next ${N} reads for this key will miss`, timestamp: this.tick, method: pp?.method, readWrite: 'write' });
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

        const currRw = particle.readWrite ?? 'read';

        this.nodeTickRequests.set(particle.targetId, (this.nodeTickRequests.get(particle.targetId) ?? 0) + particle.count);
        if (currRw === 'write') {
            this.nodeWriteRequestCount.set(particle.targetId, (this.nodeWriteRequestCount.get(particle.targetId) ?? 0) + particle.count);
        }

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
                    parentId: particle.parentTraceEventId,
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
            this.nodeErrorCount.set(particle.targetId, (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count);
            this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);
            if (particle.readWrite === 'write') {
                this.nodeWriteErrorCount.set(particle.targetId, (this.nodeWriteErrorCount.get(particle.targetId) ?? 0) + particle.count);
            }
            this.checkCircuitBreakerTrip(particle.targetId, true);

            if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
                const dbModel = this.dbModels.get(targetNode.id);
                const tickDurationMs = 100 / this.speed;
                if (dbModel) {
                    dbModel.startFailover(this.tick);
                    if (dbModel.isInFailoverWindow(this.tick, tickDurationMs) && particle.readWrite === 'write') {
                        // Write errors during catch-up window
                        this.nodeErrorCount.set(particle.targetId, (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count);
                        this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);
                        if (particle.readWrite === 'write') {
                            this.nodeWriteErrorCount.set(particle.targetId, (this.nodeWriteErrorCount.get(particle.targetId) ?? 0) + particle.count);
                        }
                        if (particle.traceId) {
                            this._tracedArrivalThisStep = true;
                            this.addTraceEvent(particle.traceId, {
                                nodeId: targetNode.id, nodeName: targetNode.name, nodeType: targetNode.type,
                                action: 'write rejected — leader failed, replica catch-up in progress',
                                timestamp: this.tick, readWrite: 'write', status: 'error',
                            });
                            this.finalizeBranch(particle.traceId, false);
                        }
                        return;
                    }
                }
            }


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
                            parentId: particle.parentTraceEventId,
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
                    parentId: particle.parentTraceEventId,
                });
                this.finalizeBranch(particle.traceId, false);
            }
            return;
        }

        if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
            const dbModel = this.dbModels.get(targetNode.id);
            if (dbModel && !targetNode.sharedConfig.chaos?.nodeFailure) {
                dbModel.resetFailover();
            }
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
        let isOverloaded = currentLoadRps > capacity;

        // --- CIRCUIT BREAKER DOWNSTREAM PROPAGATION (Task 1) ---
        // If this target node is attempting to route to a downstream service that is 'open' and the
        // target node has circuitBreaker: true in sharedConfig.resilience, we fast-fail at the target node itself.
        if (targetNode.sharedConfig?.resilience?.circuitBreaker === true) {
            const outConns = this.connectionsBySource.get(targetNode.id) ?? [];
            for (const outConn of outConns) {
                if (this.circuitBreakerState.get(outConn.targetId) === 'open') {
                    isOverloaded = true;
                    // Immediately count error on target node
                    this.nodeErrorCount.set(
                        particle.targetId,
                        (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count,
                    );
                    this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);

                    // Fast fail latency: 5ms
                    this.nodeLatencySum.set(
                        particle.targetId,
                        (this.nodeLatencySum.get(particle.targetId) ?? 0) + 5 * particle.count,
                    );

                    if (particle.traceId) {
                        this._tracedArrivalThisStep = true;
                        this.addTraceEvent(particle.traceId, {
                            nodeId: targetNode.id,
                            nodeName: targetNode.name,
                            nodeType: targetNode.type,
                            action: 'circuit breaker open — request fast-failed',
                            timestamp: this.tick,
                            method: particle.method,
                            readWrite: particle.readWrite,
                            latencyMs: 5,
                            status: 'error',
                            parentId: particle.parentTraceEventId,
                        });
                        this.finalizeBranch(particle.traceId, false);
                    }
                    return; // Terminate particle
                }
            }
        }

        if (isOverloaded) {
            this.nodeErrorCount.set(
                particle.targetId,
                (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count,
            );
            this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);
            this.checkCircuitBreakerTrip(particle.targetId, false);

            if (sourceNode) {
                this.nodeErrorCount.set(sourceNode.id, (this.nodeErrorCount.get(sourceNode.id) ?? 0) + particle.count);
                this.nodeTickErrors.set(sourceNode.id, (this.nodeTickErrors.get(sourceNode.id) ?? 0) + particle.count);
                this.checkCircuitBreakerTrip(sourceNode.id, false);

                // Cascade one more level up for cache miss routing (db -> cache -> app server)
                if (sourceNode.type === 'cache') {
                    const upstreams = this.connectionsByTarget.get(sourceNode.id) ?? [];
                    for (const upConn of upstreams) {
                        // Distribute the error weight or apply fully to all (simplification: apply fully to upstream callers)
                        this.nodeErrorCount.set(upConn.sourceId, (this.nodeErrorCount.get(upConn.sourceId) ?? 0) + particle.count);
                        this.nodeTickErrors.set(upConn.sourceId, (this.nodeTickErrors.get(upConn.sourceId) ?? 0) + particle.count);
                    }
                }
            }
        } else {
            this.attemptCircuitBreakerRecovery(particle.targetId, false);
        }

        // Add latency (node processing + protocol overhead + payload + write overhead)
        const protocolOverhead = conn ? (PROTOCOL_FACTORS[conn.protocol]?.overheadMs ?? 0) : 0;
        let latency = this.getNodeLatency(targetNode, currentLoadRps, capacity) + protocolOverhead;

        // --- DISTRIBUTED TRANSACTIONS: 2PC / Saga Overhead (Task 3) ---
        if (currRw === 'write') {
            const upAppServer = this.findUpstreamAppServer(particle.targetId);
            if (upAppServer) {
                const scApp = upAppServer.specificConfig as Record<string, unknown>;
                const txMode = scApp.distributedTransaction as string | undefined;

                if (txMode === 'two-phase-commit') {
                    // 2PC: +100ms per DB write, and 10% chance to block coordinator (simulating lock contention)
                    latency += 100;
                    if (Math.random() < 0.1) {
                        this.twoPhaseCoordinatorBlocked.add(upAppServer.id);
                        // Blocking adds even more latency to this write (+500ms)
                        latency += 500;
                    }
                } else if (txMode === 'saga') {
                    // Saga: +40ms per DB write (ventual consistency overhead)
                    latency += 40;
                }
            }
        }

        // --- CHAOS ENGINEERING: Latency Injection ---
        if (targetNode.sharedConfig.chaos?.latencyInjectionMs) {
            latency += targetNode.sharedConfig.chaos.latencyInjectionMs;
        }

        // Payload size multiplier
        const payloadMult = PAYLOAD_LATENCY_MULTIPLIER[particle.payloadSize ?? 'small'] ?? 1.0;
        latency *= payloadMult;

        // Write overhead for storage nodes (+20% for DB, +100% for object store)
        if (currRw === 'write') {
            if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
                latency *= 1.2;
            } else if (targetNode.type === 'object_store') {
                latency *= 2.0;
            }
        }

        // Apply storage engine multiplier (B-Tree vs LSM-Tree) — affects both reads and writes
        if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
            const dbModel = this.dbModels.get(targetNode.id);
            if (dbModel) {
                latency *= dbModel.getStorageEngineLatencyMultiplier(currRw as 'read' | 'write');
            }
        }

        // Apply LSM compaction spike multiplier (only during active compaction)
        if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
            const dbModelComp = this.dbModels.get(targetNode.id);
            if (dbModelComp && dbModelComp.isCompacting()) {
                latency *= dbModelComp.getCompactionLatencyMultiplier();
            }
        }

        // Quorum latency scaling (leaderless: reads/writes contact multiple nodes)
        if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
            const dbModel = this.dbModels.get(targetNode.id);
            if (dbModel) {
                latency *= dbModel.getQuorumLatencyMultiplier(currRw as 'read' | 'write');
            }
        }

        // Hot shard latency (sharding enabled + hotspot or range-based)
        if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
            const dbModel = this.dbModels.get(targetNode.id);
            if (dbModel) {
                latency *= dbModel.getHotShardLatencyMultiplier();
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

        // --- LATENCY CASCADE -> TIMEOUT ERRORS (Task 3) ---
        // If the downstream latency is very high (e.g. > 300ms from injections), we simulate timeout drops 
        // at the current node so upstream users see the errors.
        if (latency > 300 && !isOverloaded) {
            // Drop a fraction based on how far over 300ms we are
            const dropFraction = Math.min(0.9, (latency - 300) / 1000);
            if (Math.random() < dropFraction) {
                this.nodeErrorCount.set(
                    particle.targetId,
                    (this.nodeErrorCount.get(particle.targetId) ?? 0) + particle.count,
                );
                this.nodeTickErrors.set(particle.targetId, (this.nodeTickErrors.get(particle.targetId) ?? 0) + particle.count);

                // Track latency up to the point of timeout
                this.nodeLatencySum.set(
                    particle.targetId,
                    (this.nodeLatencySum.get(particle.targetId) ?? 0) + latency * particle.count,
                );

                // Track failure but continue calculating metrics (latency is what it took before timing out)
                if (particle.traceId) {
                    this._tracedArrivalThisStep = true;
                    this.addTraceEvent(particle.traceId, {
                        nodeId: targetNode.id,
                        nodeName: targetNode.name,
                        nodeType: targetNode.type,
                        action: 'cascading timeout — downstream latency too high',
                        timestamp: this.tick,
                        method: particle.method,
                        readWrite: currRw,
                        latencyMs: Math.round(latency),
                        status: 'error',
                        parentId: particle.parentTraceEventId,
                    });
                    this.finalizeBranch(particle.traceId, false);
                }
                return; // Terminate particle
            }
        }

        if (targetNode.type === 'database_sql' || targetNode.type === 'database_nosql') {
            const dbModel = this.dbModels.get(targetNode.id);
            const tickDurationMs = 100 / this.speed;

            if (dbModel) {
                if (currRw === 'write') {
                    const writeResult = dbModel.routeWrite(this.tick, tickDurationMs);
                    latency += writeResult.replicationLatencyMs;
                } else {
                    const readResult = dbModel.routeRead(this.tick, tickDurationMs);
                    if (readResult.staleRead && particle.traceId) {
                        // Pass it via particle so the trace event can reference it
                        (particle as RequestParticle & { _staleRead?: boolean })._staleRead = true;
                    }
                }
            }
        }

        // Exactly-once MQ coordination overhead
        if (targetNode.type === 'message_queue') {
            const mqGuarantee = (targetNode.specificConfig as any)?.deliveryGuarantee ?? 'at-least-once';
            if (mqGuarantee === 'exactly-once') {
                latency += 15; // coordination overhead per message (ms)
            }
        }

        this.nodeLatencySum.set(
            particle.targetId,
            (this.nodeLatencySum.get(particle.targetId) ?? 0) + latency * particle.count,
        );

        // Message queue: track enqueued (arrivals at queue; MQ ignores readWrite)
        if (targetNode.type === 'message_queue') {
            const mqModel = this.mqModels.get(particle.targetId);
            if (mqModel) {
                const backpressure = (targetNode.specificConfig as any)?.backpressure ?? 'block';
                const action = mqModel.applyBackpressure(backpressure);

                if (action === 'drop') {
                    // Record error on the upstream node that sent this particle
                    if (sourceNode) {
                        this.nodeErrorCount.set(sourceNode.id, (this.nodeErrorCount.get(sourceNode.id) ?? 0) + particle.count);
                        this.nodeTickErrors.set(sourceNode.id, (this.nodeTickErrors.get(sourceNode.id) ?? 0) + particle.count);
                        this.checkCircuitBreakerTrip(sourceNode.id, false);
                    }
                    if (particle.traceId) {
                        this._tracedArrivalThisStep = true;
                        this.addTraceEvent(particle.traceId, {
                            nodeId: targetNode.id,
                            nodeName: targetNode.name,
                            nodeType: targetNode.type,
                            action: 'queue full: message dropped (backpressure)',
                            timestamp: this.tick,
                            method: particle.method,
                            readWrite: currRw,
                            status: 'error',
                            parentId: particle.parentTraceEventId,
                        });
                        this.finalizeBranch(particle.traceId, false);
                    }
                    return; // Dropped, do not enqueue
                }

                mqModel.enqueue(particle.count);
            }
        }

        // Propagate downstream (unless it's a leaf)
        const isLeaf = this.isLeafNode(targetNode.type);
        if (particle.traceId) {
            this._tracedArrivalThisStep = true;
            if (isLeaf) {
                const methodStr = particle.method ? ` ${particle.method}` : '';
                const rwStr = currRw === 'write' ? ' (write)' : '';
                const errorNote = isOverloaded ? ' — DB write failed; cache may be inconsistent' : '';
                this.addTraceEvent(particle.traceId, {
                    nodeId: targetNode.id,
                    nodeName: targetNode.name,
                    nodeType: targetNode.type,
                    action: `${targetNode.type === 'message_queue' ? 'enqueued' : 'processed'}${methodStr} request${rwStr}${errorNote}`,
                    timestamp: this.tick,
                    method: particle.method,
                    readWrite: currRw,
                    latencyMs: Math.round(latency),
                    status: isOverloaded ? 'error' : 'ok',
                    parentId: particle.parentTraceEventId,
                    staleRead: (particle as any)._staleRead === true,
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
        parentTraceEventId?: string,
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
            parentTraceEventId,
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
        const instances = this.dynamicInstances.get(node.id) ?? node.sharedConfig.scaling?.instances ?? 1;
        const rps = node.sharedConfig.scaling?.nodeCapacityRps ?? 1000;
        const incomingConns = this.connectionsByTarget.get(node.id) ?? [];
        const avgMultiplier =
            incomingConns.length > 0
                ? incomingConns.reduce(
                    (sum, c) => sum + (PROTOCOL_FACTORS[c.protocol]?.capacityMultiplier ?? 1),
                    0,
                ) / incomingConns.length
                : 1;

        let isolationFactor = 1.0;
        if (node.type === 'database_sql') {
            const dbModel = this.dbModels.get(node.id);
            if (dbModel) isolationFactor = dbModel.getIsolationCapacityFactor();
        }

        return instances * rps * avgMultiplier * isolationFactor;
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

        let isolationMultiplier = 1.0;
        if (node.type === 'database_sql') {
            const dbModel = this.dbModels.get(node.id);
            if (dbModel) isolationMultiplier = dbModel.getIsolationLatencyMultiplier();
        }

        // Queueing delay: latency spikes as utilization → 1
        const queueFactor = utilization > 0.8 ? 1 / (1 - utilization + 0.01) : 1;
        return base * isolationMultiplier * queueFactor;
    }

    private isLeafNode(type: CanvasComponentType): boolean {
        return ['database_sql', 'database_nosql', 'object_store', 'message_queue'].includes(type);
    }

    private findUpstreamAppServer(nodeId: string): CanvasNode | undefined {
        const inConns = this.connectionsByTarget.get(nodeId) ?? [];
        for (const conn of inConns) {
            const source = this.nodeMap.get(conn.sourceId);
            if (source?.type === 'app_server') return source;
            // Recurse up one level for cache-aside (DB <- Cache <- App)
            if (source?.type === 'cache') {
                return this.findUpstreamAppServer(source.id);
            }
        }
        return undefined;
    }

    // ── Live metrics ──

    private computeLiveMetrics(): LiveMetrics {
        this.multiDbNoneWarning.clear();
        this.twoPhaseCoordinatorBlocked.clear();

        let totalRequests = 0;
        let currentClientRps = 0;
        let totalErrors = 0;
        let totalLatency = 0;
        const nodeMetrics: Record<string, NodeDetailMetrics> = {};

        for (const node of this.nodes) {
            const reqs = this.nodeRequestCount.get(node.id) ?? 0;
            const errs = this.nodeErrorCount.get(node.id) ?? 0;
            const wReqs = this.nodeWriteRequestCount.get(node.id) ?? 0;
            const wErrs = this.nodeWriteErrorCount.get(node.id) ?? 0;
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
                writeErrorRate: wReqs > 0 ? wErrs / wReqs : 0,
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
                    const liveHitRate = total >= 10 ? hits / total : 0;
                    const cacheModel = this.cacheModels.get(node.id);
                    detail.hits = hits;
                    detail.misses = misses;
                    detail.hitRate = liveHitRate;
                    (detail as any).entryCount = this.cacheSimulators.get(node.id)?.getEntries()?.length ?? 0;

                    const diagnostics: string[] = [];
                    let staleReadCount = 0;
                    if (cacheModel) {
                        const stampedeDiag = cacheModel.getStampedeDiagnostic();

                        if (stampedeDiag) diagnostics.push(stampedeDiag);

                        if (c.writeStrategy === 'write-behind') {
                            const writeBehindDelayMs = (c.writeBehindDelayMs as number) ?? 500;
                            diagnostics.push(`Write-behind active: DB may lag cache by up to ${writeBehindDelayMs}ms`);
                            staleReadCount = cacheModel.getStaleReadCount();
                            // Fallback: if per-key stale read tracking didn't fire (random key collision issue),
                            // estimate from total cumulative write-behind writes and total hits
                            if (staleReadCount === 0) {
                                const totalWbWrites = cacheModel.getTotalWriteBehindWrites();
                                if (totalWbWrites > 0 && hits > 0) {
                                    // Approximate: some fraction of reads overlap with pending write windows
                                    const staleProbability = Math.min(0.5, totalWbWrites / Math.max(hits + misses, 1));
                                    staleReadCount = Math.max(1, Math.round(hits * staleProbability));
                                }
                            }
                            const writeRps = detail.currentRps > 0 && hits + misses > 0 ? (detail.currentRps * (1 - (c.readWriteRatio as number ?? 1))) : 0;
                            if (writeRps > 0 || staleReadCount > 0) {
                                diagnostics.push(`Write-behind caching: ${staleReadCount} stale reads detected — DB write is async, cache may serve dirty data.`);
                            }
                            // Cross-config: downstream DB with serializable isolation is contradictory
                            const outConns = this.connectionsBySource.get(node.id) ?? [];
                            for (const conn of outConns) {
                                const dbNode = this.nodeMap.get(conn.targetId);
                                if (dbNode && (dbNode.type === 'database_sql' || dbNode.type === 'database_nosql')) {
                                    const dbConfig = dbNode.specificConfig as Record<string, unknown>;
                                    if ((dbConfig.isolation as string) === 'serializable') {
                                        diagnostics.push('Write-behind caching with serializable isolation is contradictory — dirty data in cache can violate the isolation contract.');
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if (diagnostics.length > 0) {
                        detail.diagnostics = diagnostics;
                    }

                    detail.staleReadCount = staleReadCount;

                    detail.componentDetail = {
                        kind: 'cache',
                        hitRate: liveHitRate,
                        hits,
                        misses,
                        entries: this.cacheSimulators.get(node.id)?.getEntries() ?? [],
                        evictionPolicy: (c.evictionPolicy as string) ?? 'lru',
                        readStrategy: (c.readStrategy as string) ?? 'cache-aside',
                        writeStrategy: (c.writeStrategy as string) ?? 'write-around',
                        ttl: (c.defaultTtl as number) ?? 3600,
                        maxEntries: Math.min(1000, Math.max(1, (c.maxEntries as number) ?? 24)),
                        placement: this.getCachePlacement(node.id),
                        staleReadCount,
                    };
                    break;
                }
                case 'cdn': {
                    const hits = this.cacheHits.get(node.id) ?? 0;
                    const misses = this.cacheMisses.get(node.id) ?? 0;
                    const total = hits + misses;
                    const liveHitRate = total >= 10 ? hits / total : 0;
                    detail.hits = hits;
                    detail.misses = misses;
                    detail.hitRate = liveHitRate;
                    detail.componentDetail = {
                        kind: 'cdn',
                        hitRate: liveHitRate,
                        hits,
                        misses,
                        edgeLocations: (c.edgeLocations as number) ?? 10,
                        ttl: (c.cacheTtl as number) ?? 3600,
                    };
                    break;
                }
                case 'load_balancer': {
                    let lbModel = this.lbModels.get(node.id);
                    if (!lbModel) {
                        lbModel = new LoadBalancerModel(node);
                        this.lbModels.set(node.id, lbModel);
                        this.lbSentRequests.set(node.id, new Map());
                    }
                    const sentMap = this.lbSentRequests.get(node.id);

                    const backends = (this.adjacency.get(node.id) ?? []).map((targetId) => {
                        const targetNode = this.nodeMap.get(targetId);

                        if (lbModel && targetNode) {
                            const targetReqs = this.nodeTickRequests.get(targetId) ?? 0;
                            const targetErrs = this.nodeTickErrors.get(targetId) ?? 0;
                            const targetErrorRate = targetReqs > 0 ? targetErrs / targetReqs : 0;
                            const tickDurMs = 100 / this.speed;

                            lbModel.recordHealthCheck(
                                targetId,
                                targetErrorRate,
                                this.tick,
                                (c.healthCheck as any) ?? node.sharedConfig.resilience?.healthCheck,
                                tickDurMs,
                                targetNode?.sharedConfig.chaos?.nodeFailure
                            );

                            if (lbModel.isInFailoverWindow(targetId) && ((c.algorithm as string) ?? 'round-robin') === 'ip-hash') {
                                detail.diagnostics = detail.diagnostics ?? [];
                                detail.diagnostics.push(`Sticky session broken — users pinned to failed backend ${targetNode.name} experiencing errors`);
                            } else if (lbModel.isInFailoverWindow(targetId)) {
                                detail.diagnostics = detail.diagnostics ?? [];
                                const hc = (c.healthCheck as any) ?? node.sharedConfig.resilience?.healthCheck as any;
                                const healthyCount = lbModel.getHealthyConnections(this.connectionsBySource.get(node.id) ?? []).length || 1;
                                const pct = Math.round((1 / healthyCount) * 100);
                                const secs = ((hc?.failoverDelayMs ?? 0) / 1000).toFixed(1);
                                detail.diagnostics.push(`Health check miss: LB routing ~${pct}% traffic to failed node for up to ${secs}s`);
                            }
                        }

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
                    let proxyModel = this.lbModels.get(node.id);
                    if (!proxyModel) {
                        proxyModel = new LoadBalancerModel(node);
                        this.lbModels.set(node.id, proxyModel);
                        this.proxySentRequests.set(node.id, new Map());
                    }
                    const sentMap = this.proxySentRequests.get(node.id);

                    const backends = (this.adjacency.get(node.id) ?? []).map((targetId) => {
                        const targetNode = this.nodeMap.get(targetId);

                        if (proxyModel && targetNode) {
                            const targetReqs = this.nodeTickRequests.get(targetId) ?? 0;
                            const targetErrs = this.nodeTickErrors.get(targetId) ?? 0;
                            const targetErrorRate = targetReqs > 0 ? targetErrs / targetReqs : 0;
                            const tickDurMs = 100 / this.speed;

                            proxyModel.recordHealthCheck(
                                targetId,
                                targetErrorRate,
                                this.tick,
                                (c.healthCheck as any) ?? node.sharedConfig.resilience?.healthCheck,
                                tickDurMs,
                                targetNode?.sharedConfig.chaos?.nodeFailure
                            );

                            if (proxyModel.isInFailoverWindow(targetId) && ((c.algorithm as string) ?? 'round-robin') === 'ip-hash') {
                                detail.diagnostics = detail.diagnostics ?? [];
                                detail.diagnostics.push(`Sticky session broken — users pinned to failed backend ${targetNode.name} experiencing errors`);
                            } else if (proxyModel.isInFailoverWindow(targetId)) {
                                detail.diagnostics = detail.diagnostics ?? [];
                                const hc = (c.healthCheck as any) ?? node.sharedConfig.resilience?.healthCheck as any;
                                const healthyCount = proxyModel.getHealthyConnections(this.connectionsBySource.get(node.id) ?? []).length || 1;
                                const pct = Math.round((1 / healthyCount) * 100);
                                const secs = ((hc?.failoverDelayMs ?? 0) / 1000).toFixed(1);
                                detail.diagnostics.push(`Health check miss: LB routing ~${pct}% traffic to failed node for up to ${secs}s`);
                            }
                        }

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
                    const instances = this.dynamicInstances.get(node.id) ?? sc.scaling?.instances ?? 1;
                    detail.instanceCount = instances;

                    const diagnostics: string[] = detail.diagnostics ?? [];
                    if (sc.resilience?.circuitBreaker) {
                        const outConns = this.connectionsBySource.get(node.id) ?? [];
                        for (const outConn of outConns) {
                            if (this.circuitBreakerState.get(outConn.targetId) === 'open') {
                                diagnostics.push('CIRCUIT BREAKER OPEN: Downstream failure detected, shedding load to protect dependencies.');
                            }
                        }
                    }

                    if (this.multiDbNoneWarning.has(node.id)) {
                        diagnostics.push("CRITICAL: Multi-DB write without distributed transaction! Possible data inconsistency.");
                    }
                    if (this.twoPhaseCoordinatorBlocked.has(node.id)) {
                        diagnostics.push("WARNING: 2PC Coordinator bottleneck detected (lock contention / blocking).");
                    }
                    if (diagnostics.length > 0) detail.diagnostics = diagnostics;

                    detail.componentDetail = {
                        kind: 'app_server',
                        activeInstances: instances,
                        maxInstances: (c.maxInstances as number) ?? 10,
                        autoScaling: (c.autoScaling as boolean) ?? false,
                        instanceType: (c.instanceType as string) ?? 'medium',
                        distributedTransaction: (c.distributedTransaction as string) ?? 'none',
                        sagaCompensation: (c.sagaCompensation as string) ?? 'choreography',
                    };
                    break;
                }
                case 'database_sql': {
                    const cap = this.getNodeCapacity(node);
                    const dbModel = this.dbModels.get(node.id);
                    if (dbModel) {
                        const lagMs = dbModel.getReplicationLagMs();
                        detail.replicationLagMs = lagMs;
                        detail.staleReadCount = dbModel.getStaleReadCount();

                        const diagnostics: string[] = detail.diagnostics ?? [];

                        if (dbModel.syncMode === 'asynchronous') {
                            diagnostics.push(
                                `Async replication: committed writes may be lost if the leader crashes before replicas catch up`
                            );
                            if (dbModel.getStaleReadCount() > 0) {
                                diagnostics.push(
                                    `Reads-your-writes not guaranteed: replica lag ~${dbModel.replicationLagMs}ms`
                                );
                            }
                        }

                        // TC-042 — data loss warning after async failover
                        if (node.sharedConfig.chaos?.nodeFailure &&
                            dbModel.replicationMode === 'single-leader' &&
                            dbModel.syncMode === 'asynchronous') {
                            diagnostics.push(
                                `Potential data loss: ~${dbModel.replicationLagMs}ms of async writes may not have replicated`
                            );
                            dbModel.startFailover(this.tick);
                        }

                        // Isolation Diagnostics
                        const rps = detail.currentRps ?? 0;
                        const isolation = dbModel.isolationLevel;
                        if (isolation === 'serializable' && rps > 0.7 * cap) {
                            diagnostics.push(`Serializable isolation detected as throughput bottleneck — consider read-committed + application-level conflict handling.`);
                        }
                        if ((isolation === 'read-committed' || isolation === 'read-uncommitted') && dbModel.replicationMode === 'multi-leader') {
                            diagnostics.push(`Write skew risk: read-committed isolation with multi-leader replication allows concurrent writes to conflict without detection.`);
                        }

                        // Storage engine diagnostics
                        const totalReqs = this.nodeRequestCount.get(node.id) ?? 0;
                        const writeReqs = this.nodeWriteRequestCount.get(node.id) ?? 0;
                        const writeRatio = totalReqs > 0 ? writeReqs / totalReqs : 0;
                        const dbSe = (c.storageEngine ?? {}) as Record<string, unknown>;
                        const seType = (dbSe.type as string) ?? 'b-tree';
                        const isWriteHeavy = writeRatio > 0.5;
                        const isReadHeavy = writeRatio < 0.3 && totalReqs > 10;

                        if (seType === 'b-tree' && isWriteHeavy) {
                            diagnostics.push(
                                'B-Trees write in-place. High write amplification at scale can saturate I/O ' +
                                '— consider LSM-tree engines like RocksDB for write-heavy workloads.'
                            );
                        }
                        if (seType === 'lsm-tree' && isReadHeavy && !(dbSe.bloomFilters as boolean)) {
                            diagnostics.push(
                                'LSM-trees optimize for writes. Reads may check multiple SSTables ' +
                                '— use bloom filters to reduce unnecessary I/O.'
                            );
                        }

                        if (dbModel?.isCompacting()) {
                            diagnostics.push('LSM compaction active — background I/O spike (2–3× latency)');
                        }

                        // Sharding — hot shard diagnostic
                        const shardingSql = (c.sharding ?? {}) as Record<string, unknown>;
                        const shardingEnabledSql = (shardingSql.enabled as boolean) ?? false;
                        if (shardingEnabledSql) {
                            const hotspotFactorSql = (shardingSql.hotspotFactor as number) ?? 0;
                            const strategySql = (shardingSql.strategy as string) ?? 'hash-based';
                            const shardCountSql = (shardingSql.shardCount as number) ?? 4;
                            const isHotSql = hotspotFactorSql > 0.3 || strategySql === 'range-based';
                            detail.shardCount = shardCountSql;

                            if (isHotSql) {
                                const hotPct = Math.round(hotspotFactorSql * 100);
                                const latencyMultSql = 1 + hotspotFactorSql * 4;
                                diagnostics.push(
                                    `HOT SHARD: ${hotPct}% of traffic on skewed shard — ${latencyMultSql.toFixed(1)}× latency`
                                );
                                detail.isHotShard = true;
                                detail.hotshardLatencyMultiplier = latencyMultSql;
                            }
                            if (strategySql === 'hash-based') {
                                const consistentSql = (shardingSql.consistentHashing as boolean) ?? true;
                                if (consistentSql) {
                                    diagnostics.push('Consistent hashing: resharding minimizes key movement');
                                } else {
                                    diagnostics.push('Non-consistent hashing: resharding can cause full key reassignment');
                                }
                            }
                        }

                        if (diagnostics.length > 0) detail.diagnostics = diagnostics;
                    }

                    detail.componentDetail = {
                        kind: 'database_sql',
                        engine: (c.engine as string) ?? 'postgresql',
                        readCapacity: Math.round(cap * 0.8),
                        writeCapacity: Math.round(cap * 0.2),
                        readReplicas: (c.readReplicas as number) ?? 0,
                        connectionPooling: (c.connectionPooling as boolean) ?? true,
                        activeConnections: this.nodeActiveCount.get(node.id) ?? 0,
                        replicationLagMs: detail.replicationLagMs,
                        isCompacting: dbModel?.isCompacting() ?? false,
                        nextCompactionInSeconds: dbModel?.getNextCompactionInSeconds(this.tick, 100 / this.speed) ?? 0,
                        ...(detail.shardCount != null && { shardCount: detail.shardCount }),
                        ...(detail.isHotShard && { isHotShard: true, hotshardLatencyMultiplier: detail.hotshardLatencyMultiplier }),
                    };
                    break;
                }
                case 'database_nosql': {
                    const cap = this.getNodeCapacity(node);
                    const dbModel = this.dbModels.get(node.id);
                    if (dbModel) {
                        const lagMs = dbModel.getReplicationLagMs();
                        detail.replicationLagMs = lagMs;
                        detail.staleReadCount = dbModel.getStaleReadCount();

                        const diagnostics: string[] = detail.diagnostics ?? [];

                        if (dbModel.syncMode === 'asynchronous') {
                            diagnostics.push(
                                `Async replication: committed writes may be lost if the leader crashes before replicas catch up`
                            );
                            if (dbModel.getStaleReadCount() > 0) {
                                diagnostics.push(
                                    `Reads-your-writes not guaranteed: replica lag ~${dbModel.replicationLagMs}ms`
                                );
                            }
                        }

                        // TC-042 — data loss warning after async failover
                        if (node.sharedConfig.chaos?.nodeFailure &&
                            dbModel.replicationMode === 'single-leader' &&
                            dbModel.syncMode === 'asynchronous') {
                            diagnostics.push(
                                `Potential data loss: ~${dbModel.replicationLagMs}ms of async writes may not have replicated`
                            );
                            dbModel.startFailover(this.tick);
                        }

                        // Storage engine diagnostics
                        const totalReqsN = this.nodeRequestCount.get(node.id) ?? 0;
                        const writeReqsN = this.nodeWriteRequestCount.get(node.id) ?? 0;
                        const writeRatioN = totalReqsN > 0 ? writeReqsN / totalReqsN : 0;
                        const dbSeN = (c.storageEngine ?? {}) as Record<string, unknown>;
                        const seTypeN = (dbSeN.type as string) ?? 'b-tree';
                        const isWriteHeavyN = writeRatioN > 0.5;
                        const isReadHeavyN = writeRatioN < 0.3 && totalReqsN > 10;

                        if (seTypeN === 'b-tree' && isWriteHeavyN) {
                            diagnostics.push(
                                'B-Trees write in-place. High write amplification at scale can saturate I/O ' +
                                '— consider LSM-tree engines like RocksDB for write-heavy workloads.'
                            );
                        }
                        if (seTypeN === 'lsm-tree' && isReadHeavyN && !(dbSeN.bloomFilters as boolean)) {
                            diagnostics.push(
                                'LSM-trees optimize for writes. Reads may check multiple SSTables ' +
                                '— use bloom filters to reduce unnecessary I/O.'
                            );
                        }

                        if (dbModel?.isCompacting()) {
                            diagnostics.push('LSM compaction active — background I/O spike (2–3× latency)');
                        }

                        // Sharding — hot shard diagnostic (use c = node.specificConfig)
                        const shardingNoSql = (c.sharding ?? {}) as Record<string, unknown>;
                        const shardingEnabledNoSql = (shardingNoSql.enabled as boolean) ?? false;
                        if (shardingEnabledNoSql) {
                            const hotspotFactorNoSql = (shardingNoSql.hotspotFactor as number) ?? 0;
                            const strategyNoSql = (shardingNoSql.strategy as string) ?? 'hash-based';
                            const shardCountNoSql = (shardingNoSql.shardCount as number) ?? 4;
                            const isHotNoSql = hotspotFactorNoSql > 0.3 || strategyNoSql === 'range-based';
                            detail.shardCount = shardCountNoSql;

                            if (isHotNoSql) {
                                const hotPctNoSql = Math.round(hotspotFactorNoSql * 100);
                                const latencyMultNoSql = 1 + hotspotFactorNoSql * 4;
                                diagnostics.push(
                                    `HOT SHARD: ${hotPctNoSql}% of traffic on skewed shard — ${latencyMultNoSql.toFixed(1)}× latency`
                                );
                                detail.isHotShard = true;
                                detail.hotshardLatencyMultiplier = latencyMultNoSql;
                            }
                            if (strategyNoSql === 'hash-based') {
                                const consistentNoSql = (shardingNoSql.consistentHashing as boolean) ?? true;
                                if (consistentNoSql) {
                                    diagnostics.push('Consistent hashing: resharding minimizes key movement');
                                } else {
                                    diagnostics.push('Non-consistent hashing: resharding can cause full key reassignment');
                                }
                            }
                        }

                        // Leaderless replication — quorum diagnostics
                        const noSqlSpecific = node.specificConfig as Record<string, unknown>;
                        const replication = (noSqlSpecific.replication ?? {}) as Record<string, unknown>;
                        const replicationMode = (replication.mode as string) ?? 'single-leader';

                        if (replicationMode === 'leaderless') {
                            const quorum = (noSqlSpecific.quorum ?? {}) as Record<string, unknown>;
                            const n = (quorum.n as number) ?? 3;
                            const w = (quorum.w as number) ?? 2;
                            const r = (quorum.r as number) ?? 2;

                            if (w + r <= n) {
                                diagnostics.push(
                                    `Quorum condition not met (w=${w} + r=${r} = ${w + r} ≤ n=${n}) — ` +
                                    `stale reads possible even without failures. ` +
                                    `Fix: increase r to ${n - w + 1} (w + r = ${w + (n - w + 1)} > n = ${n})`
                                );
                            } else {
                                diagnostics.push(
                                    `Quorum condition met (w=${w} + r=${r} = ${w + r} > n=${n}) — ` +
                                    `reads are linearizable`
                                );
                            }

                            const instances = (node.sharedConfig.scaling?.instances as number) ?? 1;
                            const majority = Math.ceil(n / 2) + 1;
                            if (instances < majority) {
                                diagnostics.push(
                                    `Quorum majority at risk — only ${instances} of ${n} nodes available. ` +
                                    `Writes may not reach quorum`
                                );
                            }

                            detail.quorumConditionMet = w + r > n;
                            detail.quorumSummary = `w=${w} r=${r} n=${n}`;
                        }

                        if (diagnostics.length > 0) detail.diagnostics = diagnostics;
                    }

                    detail.componentDetail = {
                        kind: 'database_nosql',
                        engine: (c.engine as string) ?? 'dynamodb',
                        consistencyLevel: (c.consistencyLevel as string) ?? 'eventual',
                        capacity: cap,
                        utilization,
                        replicationLagMs: detail.replicationLagMs,
                        isCompacting: dbModel?.isCompacting() ?? false,
                        nextCompactionInSeconds: dbModel?.getNextCompactionInSeconds(this.tick, 100 / this.speed) ?? 0,
                        ...(detail.quorumSummary != null && { quorumConditionMet: detail.quorumConditionMet, quorumSummary: detail.quorumSummary }),
                        ...(detail.shardCount != null && { shardCount: detail.shardCount }),
                        ...(detail.isHotShard && { isHotShard: true, hotshardLatencyMultiplier: detail.hotshardLatencyMultiplier }),
                    };
                    break;
                }
                case 'message_queue': {
                    const mqModel = this.mqModels.get(node.id);

                    const outEdges = this.connectionsBySource.get(node.id) ?? [];
                    let totalConsumerCapacity = 0;
                    for (const edge of outEdges) {
                        const consumer = this.nodeMap.get(edge.targetId);
                        if (consumer && consumer.type !== 'object_store' && consumer.type !== 'database_sql' && consumer.type !== 'database_nosql') {
                            const rawCap = (consumer.sharedConfig.scaling?.nodeCapacityRps as number ?? 1000) * (consumer.sharedConfig.scaling?.instances as number ?? 1);
                            totalConsumerCapacity += rawCap;
                        }
                    }

                    const consumerThroughput = totalConsumerCapacity;
                    const consumerGroupCount = (c as any)?.consumerGroupCount ?? (sc as any)?.scaling?.consumerGroupCount ?? 1;
                    const producerRps = this.nodeRpsEma.get(node.id) ?? 0;

                    const queueDepth = mqModel?.getQueueDepth() ?? 0;
                    detail.queueDepth = queueDepth;

                    const isLagging = queueDepth > 0 && producerRps > consumerThroughput * consumerGroupCount;

                    const mqGuarantee = (c as any)?.deliveryGuarantee ?? 'at-least-once';

                    if (mqModel) {
                        mqModel.recordLagTick(isLagging);
                        if (mqModel.getConsumerLag() > 10) {
                            detail.diagnostics = detail.diagnostics ?? [];
                            detail.diagnostics.push('Consumer lag building — add consumer replicas or increase consumerGroupCount');
                        }
                    }

                    // at-least-once restart diagnostic
                    for (const edge of outEdges) {
                        const consumerId = edge.targetId;
                        const consumerNode = this.nodeMap.get(consumerId);
                        const wasFailing = this.previousNodeFailure.get(consumerId) ?? false;
                        const isFailingNow = !!consumerNode?.sharedConfig.chaos?.nodeFailure;
                        if (wasFailing && !isFailingNow && mqGuarantee === 'at-least-once') {
                            detail.diagnostics = detail.diagnostics ?? [];
                            detail.diagnostics.push(
                                'Consumer restarted — replaying uncommitted messages (at-least-once delivery). ' +
                                'Downstream consumers must be idempotent'
                            );
                        }
                    }

                    // Persistent idempotency diagnostic for at-least-once
                    if (mqGuarantee === 'at-least-once') {
                        detail.diagnostics = detail.diagnostics ?? [];
                        detail.diagnostics.push(
                            'at-least-once delivery: downstream consumers must handle duplicate messages ' +
                            'idempotently'
                        );
                    }

                    detail.componentDetail = {
                        kind: 'message_queue',
                        partitions: sc.scaling?.instances ?? 1,
                        isFifo: (c.type as string) === 'fifo',
                        queueDepth,
                        enqueued: mqModel?.totalEnqueued ?? 0,
                        processed: mqModel?.totalProcessed ?? 0,
                        deadLettered: 0,
                        droppedMessages: mqModel?.droppedMessages ?? 0,
                        deliveryGuarantee: mqGuarantee,
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

            // SPOF diagnostic: single-instance non-client nodes with connections
            if (node.type !== 'client') {
                const instances = node.sharedConfig?.scaling?.instances ?? 1;
                const hasConns = (this.connectionsBySource.get(node.id)?.length ?? 0) > 0
                    || (this.connectionsByTarget.get(node.id)?.length ?? 0) > 0;
                if (instances <= 1 && hasConns) {
                    detail.diagnostics = detail.diagnostics ?? [];
                    detail.diagnostics.push('Single-instance node — SPOF: no redundancy. Consider adding replicas.');
                }
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

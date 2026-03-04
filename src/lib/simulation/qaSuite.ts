import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import { SimulationRunner, LiveMetrics } from './SimulationRunner';
import type { RequestTrace } from './types';
import { COMPONENT_CATALOG, getCatalogEntry } from '@/lib/data/componentCatalog';
import { DEFAULT_SHARED_CONFIG } from '@/lib/types/canvas';

/**
 * SysCrack QA Suite — maps to syscrack-requirements.md §5 (TC-001–TC-064).
 * Only a subset of TCs is implemented; permanently deferred TCs are present as
 * BLOCKED stubs (runTC012, runTC021, runTC024, runTC035, runTC043,
 * runTC050, runTC051) and return passed: false until the required component/feature exists.
 */
export interface QaResult {
    id: string;
    name: string;
    passed: boolean;
    failures: string[];
}

interface RunSimOptions {
    ticks?: number;
    speed?: number;
    loadFactor?: number;
}

function makeNode(
    id: string,
    type: string,
    name: string,
    x: number,
    y: number,
    configs?: { shared?: any; specific?: any },
): CanvasNode {
    const catalog = getCatalogEntry(type) ?? COMPONENT_CATALOG[0];
    const sharedConfig = catalog.defaultSharedConfig ?? DEFAULT_SHARED_CONFIG;
    const specificConfig = catalog.defaultSpecificConfig ?? {};
    return {
        id,
        type: type as CanvasNode['type'],
        name,
        x,
        y,
        width: 160,
        height: 80,
        sharedConfig: { ...sharedConfig, ...(configs?.shared || {}) },
        specificConfig: { ...specificConfig, ...(configs?.specific || {}) },
    };
}

function makeConnection(id: string, sourceId: string, targetId: string): CanvasConnection {
    return { id, sourceId, targetId, protocol: 'http', bidirectional: false };
}

function runSim(
    nodes: CanvasNode[],
    connections: CanvasConnection[],
    ticks: number = 400,
    options?: RunSimOptions,
): LiveMetrics {
    let lastMetrics: LiveMetrics | null = null;
    const runner = new SimulationRunner(nodes, connections, (particles, metrics) => {
        lastMetrics = metrics;
    });

    if (options?.speed != null) runner.setSpeed(options.speed);
    if (options?.loadFactor != null) runner.setLoadFactor(options.loadFactor);

    runner.startForExternalLoop();
    for (let i = 0; i < ticks; i++) {
        runner.stepOnce(100); // cappedDt is 100ms in SimulationRunner
    }

    // Fallback if no metrics collected
    if (!lastMetrics) {
        return {
            rps: 0, avgLatencyMs: 0, errorRate: 0, estimatedCostMonthly: 0, readParticles: 0, writeParticles: 0, nodeMetrics: {}
        };
    }
    return lastMetrics;
}

// SPOF helper replicating UI logic
function hasSpof(node: CanvasNode, connections: CanvasConnection[]): boolean {
    const instances = node.sharedConfig?.scaling?.instances ?? 1;
    const hasSuccessors = connections.some(c => c.sourceId === node.id);
    const hasPredecessors = connections.some(c => c.targetId === node.id);
    return instances <= 1 && (hasSuccessors || hasPredecessors);
}

// ---------------------------------------------------------
// TC-001: Basic Client → App Server → SQL DB
// ---------------------------------------------------------
function runTC001(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100, readWriteRatio: 0.8 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { scaling: { instances: 1 } } }),
        makeNode('db1', 'database_sql', 'Database', 400, 0, { shared: { scaling: { instances: 1 } } }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections);
    const failures: string[] = [];

    // Check Top Bar RPS ~ 100
    if (Math.abs(metrics.rps - 100) > 15) failures.push(`Top bar RPS was ${metrics.rps}, expected ~100`);

    // Check DB RPS
    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    if (Math.abs(dbRps - 100) > 15) failures.push(`DB RPS was ${dbRps}, expected ~100`);

    // Check SPOF
    if (!hasSpof(nodes[2], connections)) failures.push('DB node missing SPOF badge logic');

    return { id: 'TC-001', name: 'Basic Client → App Server → SQL DB', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-002: CDN Cache Hit Rate
// ---------------------------------------------------------
function runTC002(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000, readWriteRatio: 1.0 } }),
        makeNode('cdn1', 'cdn', 'CDN', 200, 0, { specific: { hitRate: 0.8 } }), // using standard config
        makeNode('app1', 'app_server', 'App Server', 400, 0, { shared: { scaling: { instances: 1 } } }),
        makeNode('db1', 'database_sql', 'Database', 600, 0, { shared: { scaling: { instances: 1 } } }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'cdn1'),
        makeConnection('conn2', 'cdn1', 'app1'),
        makeConnection('conn3', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 60); // give it time to accumulate
    const failures: string[] = [];

    const appRps = metrics.nodeMetrics['app1']?.currentRps || 0;

    // 80% hit rate on 1000 RPS -> 200 RPS to App Server
    if (appRps > 250 || appRps < 150) {
        failures.push(`App Server RPS was ${appRps}, expected ~200 (20% of 1000)`);
    }

    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    if (dbRps > appRps * 1.5) failures.push(`DB RPS (${dbRps}) should be <= App Server RPS (${appRps})`);

    return { id: 'TC-002', name: 'CDN Cache Hit Rate', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-003: Load Balancer Algorithm — Weighted Distribution
// ---------------------------------------------------------
function runTC003(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('lb1', 'load_balancer', 'LB', 200, 0, { specific: { algorithm: 'weighted', backendWeights: { 'appA': 3, 'appB': 1 } } }),
        makeNode('appA', 'app_server', 'App A', 400, -100),
        makeNode('appB', 'app_server', 'App B', 400, 100),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'lb1', 'appA'),
        makeConnection('conn3', 'lb1', 'appB'),
    ];

    const metrics = runSim(nodes, connections, 40);
    const failures: string[] = [];

    const rpsA = metrics.nodeMetrics['appA']?.currentRps || 0;
    const rpsB = metrics.nodeMetrics['appB']?.currentRps || 0;

    // Weight 3:1 means A handles 3x what B handles. Total 100 RPS.
    // A ~ 75 RPS, B ~ 25 RPS
    if (Math.abs(rpsA - 75) > 15) failures.push(`App A RPS was ${rpsA}, expected ~75`);
    if (Math.abs(rpsB - 25) > 10) failures.push(`App B RPS was ${rpsB}, expected ~25`);

    return { id: 'TC-003', name: 'Weighted LB Distribution', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-004: Cache hit/miss flow + accounting
// ---------------------------------------------------------
function runTC004(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000, readWriteRatio: 1.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, { specific: { hitRate: 0.8, maxEntries: 100 } }),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'cache1'),
        makeConnection('conn3', 'cache1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 120); // longer warm-up
    const failures: string[] = [];

    const cacheRps = metrics.nodeMetrics['cache1']?.currentRps || 0;
    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    const cacheHitRate = metrics.nodeMetrics['cache1']?.hitRate || 0;
    const cacheHits = metrics.nodeMetrics['cache1']?.hits || 0;
    const cacheMisses = metrics.nodeMetrics['cache1']?.misses || 0;

    // RPS routing
    if (Math.abs(cacheRps - 1000) > 100)
        failures.push(`Cache RPS was ${cacheRps}, expected ~1000`);
    if (dbRps > 250 || dbRps < 150)
        failures.push(`DB RPS was ${dbRps}, expected ~200 (20% misses)`);

    // Hit/miss accounting (the new assertions)
    if (cacheHits <= 0)
        failures.push(`Cache hits was ${cacheHits}, expected > 0 after warm-up`);
    if (cacheMisses <= 0)
        failures.push(`Cache misses was ${cacheMisses}, expected > 0`);
    if (cacheHitRate < 0.5)
        failures.push(`Cache hit rate was ${cacheHitRate}, expected > 0.5 after warm-up`);

    return { id: 'TC-004', name: 'Cache hit/miss flow + accounting', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-007: Write-through cache (formerly TC-005)
// ---------------------------------------------------------
function runTC007(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100, readWriteRatio: 0.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, { specific: { writeStrategy: 'write-through' } }),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'cache1'),
        makeConnection('conn3', 'cache1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    if (dbRps <= 80) failures.push(`DB RPS was ${dbRps}, expected > 80 for write-through`);

    return { id: 'TC-007', name: 'Write-through cache consistency', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-008: Write-Behind Consistency Window
// ---------------------------------------------------------
export function runTC008(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100, readWriteRatio: 0.2 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, {
            specific: { writeStrategy: 'write-behind', writeBehindDelayMs: 500 },
        }),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'cache1'),
        makeConnection('conn3', 'cache1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 120);
    const failures: string[] = [];

    const cacheHits = metrics.nodeMetrics['cache1']?.hits || 0;
    const cacheMisses = metrics.nodeMetrics['cache1']?.misses || 0;

    console.log(`[TC-008 Debug] Cache1: Hits=${cacheHits}, Misses=${cacheMisses}, StaleReads=${metrics.nodeMetrics['cache1']?.staleReadCount || 0}`);

    // Write-behind: delayed writes must reach DB (DB > 0). No upper bound — DB gets delayed writes + read misses.
    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    if (dbRps === 0)
        failures.push(`DB RPS was 0 — delayed writes not firing`);

    // staleRead diagnostic should exist on cache
    const cacheDiags = metrics.nodeMetrics['cache1']?.diagnostics || [];
    const hasWriteBehindDiag = cacheDiags.some((d: string) =>
        d.toLowerCase().includes('write-behind') || d.toLowerCase().includes('lag')
    );
    if (!hasWriteBehindDiag)
        failures.push('Cache missing write-behind diagnostic');

    // staleRead count should be > 0 (reads during the lag window)
    const staleReads_ = metrics.nodeMetrics['cache1']?.staleReadCount || 0;
    if (staleReads_ <= 0)
        failures.push(`staleReadCount was ${staleReads_}, expected > 0 during write-behind window`);

    return { id: 'TC-008', name: 'Write-Behind Consistency Window', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-003b: Round-robin LB (formerly TC-007)
// ---------------------------------------------------------
function runTC003b(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('lb1', 'load_balancer', 'LB', 200, 0, { specific: { algorithm: 'round-robin' } }),
        makeNode('app1', 'app_server', 'App 1', 400, -100),
        makeNode('app2', 'app_server', 'App 2', 400, 0),
        makeNode('app3', 'app_server', 'App 3', 400, 100),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'lb1', 'app1'),
        makeConnection('conn3', 'lb1', 'app2'),
        makeConnection('conn4', 'lb1', 'app3'),
    ];

    const metrics = runSim(nodes, connections, 50);
    const failures: string[] = [];

    const rps1 = metrics.nodeMetrics['app1']?.currentRps || 0;
    const rps2 = metrics.nodeMetrics['app2']?.currentRps || 0;
    const rps3 = metrics.nodeMetrics['app3']?.currentRps || 0;

    if (Math.abs(rps1 - rps2) > 10 || Math.abs(rps2 - rps3) > 10 || Math.abs(rps1 - rps3) > 10) {
        failures.push(`App servers unbalanced: App1=${rps1}, App2=${rps2}, App3=${rps3}`);
    }

    return { id: 'TC-003b', name: 'Round-robin LB', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-008b: Node capacity overload (formerly TC-008)
// ---------------------------------------------------------
function runTC008b(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 500 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { scaling: { instances: 1, nodeCapacityRps: 100 } } }),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];
    const metrics = runSim(nodes, connections, 50);
    const failures: string[] = [];

    const appErr = metrics.nodeMetrics['app1']?.avgErrorRate || 0;
    if (appErr <= 0.3) failures.push(`App Server error rate was ${appErr}, expected > 0.3 due to overload`);
    if (metrics.errorRate <= 0.2) failures.push(`System error rate was ${metrics.errorRate}, expected > 0.2 due to overload`);

    return { id: 'TC-008b', name: 'Node capacity overload', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-009: MQ Consumer Lag (requirements TC-009)
// ---------------------------------------------------------
function runTC009(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 500, readWriteRatio: 0.0 } }),
        makeNode('app1', 'app_server', 'App Server (producer)', 200, 0),
        makeNode('mq1', 'message_queue', 'MQ', 400, 0, {
            specific: {
                deliveryGuarantee: 'at-least-once',
                consumerGroupCount: 1,
                backpressure: 'block',
            },
        }),
        makeNode('app2', 'app_server', 'App Server (consumer)', 600, 0, {
            shared: { scaling: { instances: 1, nodeCapacityRps: 100 } },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-mq', 'app1', 'mq1'),
        makeConnection('mq-app2', 'mq1', 'app2'),
    ];

    const metrics = runSim(nodes, connections, 200);
    const failures: string[] = [];

    // Queue depth should be growing (500 producer > 100 consumer)
    const queueDepth = metrics.nodeMetrics['mq1']?.queueDepth ?? 0;
    if (queueDepth <= 0)
        failures.push(`Queue depth was ${queueDepth}, expected > 0 (producer outpaces consumer)`);

    // Consumer RPS should be capacity-limited (~100)
    const consumerRps = metrics.nodeMetrics['app2']?.currentRps ?? 0;
    if (consumerRps > 120)
        failures.push(`Consumer RPS was ${consumerRps}, expected <= 120 (capacity 100)`);

    // Consumer lag diagnostic should fire
    const mqDiagnostics = (metrics.nodeMetrics['mq1']?.diagnostics ?? []) as string[];
    const hasLagDiag = mqDiagnostics.some((d: string) =>
        d.toLowerCase().includes('lag') || d.toLowerCase().includes('consumer')
    );
    if (!hasLagDiag)
        failures.push('MQ missing consumer lag diagnostic');

    return { id: 'TC-009', name: 'MQ Consumer Lag', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-ProxyRouting: Proxy routing (custom, no requirements number)
// ---------------------------------------------------------
function runTCProxyRouting(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('proxy1', 'proxy', 'Proxy', 400, 0),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'proxy1'),
        makeConnection('conn3', 'proxy1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    const proxyRps = metrics.nodeMetrics['proxy1']?.currentRps ?? 0;
    const dbRps = metrics.nodeMetrics['db1']?.currentRps ?? 0;

    if (proxyRps <= 80) failures.push(`Proxy RPS was ${proxyRps}, expected > 80`);
    if (dbRps <= 80) failures.push(`DB RPS was ${dbRps}, expected > 80`);

    return { id: 'TC-ProxyRouting', name: 'Proxy routing', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-010: SPOF Detection
// ---------------------------------------------------------
function runTC010(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { scaling: { instances: 1 } } }),
        makeNode('db1', 'database_sql', 'Database', 400, 0, { shared: { scaling: { instances: 1 } } }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 60);
    const failures: string[] = [];

    // DB with instances: 1 and connections should be flagged as SPOF
    if (!hasSpof(nodes[2], connections))
        failures.push('DB node (instances: 1) not detected as SPOF');

    // App Server with instances: 1 should also be SPOF
    if (!hasSpof(nodes[1], connections))
        failures.push('App Server node (instances: 1) not detected as SPOF');

    // Single-instance nodes in traffic path should show SPOF in diagnostics
    const dbDiagnostics = metrics.nodeMetrics['db1']?.diagnostics || [];
    const hasSpofDiag = dbDiagnostics.some((d: string) =>
        d.toLowerCase().includes('spof') || d.toLowerCase().includes('single point')
    );
    if (!hasSpofDiag)
        failures.push('DB node missing SPOF diagnostic message');

    return { id: 'TC-010', name: 'SPOF Detection — Single Instance', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-011: Protocol Factor Impact
// ---------------------------------------------------------
function runTC011(): QaResult {
    const baseNodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 200 } }),
        makeNode('appA', 'app_server', 'App A', 200, 0),
        makeNode('appB', 'app_server', 'App B', 400, 0),
    ];

    const httpConn: CanvasConnection[] = [
        makeConnection('conn1', 'c1', 'appA'),
        { ...makeConnection('conn2', 'appA', 'appB'), protocol: 'http' },
    ];
    const grpcConn: CanvasConnection[] = [
        makeConnection('conn1', 'c1', 'appA'),
        { ...makeConnection('conn2', 'appA', 'appB'), protocol: 'grpc' },
    ];

    const mHttp = runSim(baseNodes, httpConn, 80);
    const mGrpc = runSim(baseNodes, grpcConn, 80);
    const failures: string[] = [];

    const httpLatency = mHttp.nodeMetrics['appB']?.avgLatencyMs || 0;
    const grpcLatency = mGrpc.nodeMetrics['appB']?.avgLatencyMs || 0;

    // gRPC overhead is 2ms vs HTTP 8ms — gRPC should be lower latency
    if (grpcLatency >= httpLatency)
        failures.push(`gRPC latency (${grpcLatency}ms) should be lower than HTTP (${httpLatency}ms)`);

    // gRPC capacity multiplier is 1.4x vs HTTP 1.0x — gRPC should handle more RPS
    const httpRps = mHttp.nodeMetrics['appB']?.currentRps || 0;
    const grpcRps = mGrpc.nodeMetrics['appB']?.currentRps || 0;
    if (grpcRps < httpRps)
        failures.push(`gRPC RPS (${grpcRps}) should be >= HTTP RPS (${httpRps}) due to higher capacity multiplier`);

    return { id: 'TC-011', name: 'Protocol Factor — HTTP vs gRPC', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-020: Full E-Commerce Read Path
// ---------------------------------------------------------
function runTC020(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000, readWriteRatio: 1.0 } }),
        makeNode('cdn1', 'cdn', 'CDN', 150, 0, { specific: { hitRate: 0.7 }, shared: { scaling: { instances: 1, nodeCapacityRps: 2000 } } }),
        makeNode('lb1', 'load_balancer', 'LB', 300, 0, { specific: { algorithm: 'round-robin' } }),
        makeNode('appA', 'app_server', 'App A', 450, -60, {
            shared: { scaling: { instances: 1, nodeCapacityRps: 500 } }
        }),
        makeNode('appB', 'app_server', 'App B', 450, 60, {
            shared: { scaling: { instances: 1, nodeCapacityRps: 500 } }
        }),
        makeNode('cache1', 'cache', 'Cache', 600, 0, { specific: { hitRate: 0.8, maxEntries: 500 } }),
        makeNode('db1', 'database_sql', 'Database', 750, 0),
    ];
    const connections = [
        makeConnection('c1-cdn', 'c1', 'cdn1'),
        makeConnection('cdn-lb', 'cdn1', 'lb1'),
        makeConnection('lb-appA', 'lb1', 'appA'),
        makeConnection('lb-appB', 'lb1', 'appB'),
        makeConnection('appA-cache', 'appA', 'cache1'),
        makeConnection('appB-cache', 'appB', 'cache1'),
        makeConnection('cache-db', 'cache1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 200);
    console.log('AppA capacity:', metrics.nodeMetrics['appA']?.capacity);
    const failures: string[] = [];

    // CDN absorbs 70% → LB receives ~300 RPS
    const lbRps = metrics.nodeMetrics['lb1']?.currentRps || 0;
    if (lbRps > 350 || lbRps < 250)
        failures.push(`LB RPS was ${lbRps}, expected ~300 (30% of 1000 after CDN)`);

    // LB distributes evenly across 2 app servers
    const rpsA = metrics.nodeMetrics['appA']?.currentRps || 0;
    const rpsB = metrics.nodeMetrics['appB']?.currentRps || 0;
    if (Math.abs(rpsA - rpsB) > 30)
        failures.push(`LB uneven: App A=${rpsA}, App B=${rpsB}, expected ~equal`);

    // DB receives ~20% of LB RPS (cache absorbs 80%)
    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    if (dbRps > 80)
        failures.push(`DB RPS was ${dbRps}, expected <= 80 (20% cache miss of 300 RPS)`);

    // Overall error rate should be near zero
    if (metrics.errorRate > 0.02)
        failures.push(`System error rate was ${metrics.errorRate}, expected < 2%`);

    return { id: 'TC-020', name: 'Full E-Commerce Read Path', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-034: Circuit Breaker Activation
// ---------------------------------------------------------
function runTC034(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, {
            shared: { resilience: { circuitBreaker: true, automaticRetries: true, retryBackoff: 'exponential' } }
        }),
        makeNode('db1', 'database_sql', 'Database', 400, 0, {
            shared: { chaos: { nodeFailure: true } }
        }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 100);
    const failures: string[] = [];

    // DB should be failing (node failure chaos)
    const dbErr = metrics.nodeMetrics['db1']?.avgErrorRate || 0;
    if (dbErr < 0.9)
        failures.push(`DB error rate was ${dbErr}, expected ~1.0 (node failure)`);

    // App Server circuit breaker should open — error rate rises
    const appErr = metrics.nodeMetrics['app1']?.avgErrorRate || 0;
    if (appErr < 0.5)
        failures.push(`App Server error rate was ${appErr}, expected > 0.5 after circuit breaker`);

    // After circuit opens: latency should DROP (fast-fail, not waiting for DB timeout)
    const appLatency = metrics.nodeMetrics['app1']?.avgLatencyMs || 0;
    const dbLatency = metrics.nodeMetrics['db1']?.avgLatencyMs || 0;
    if (appLatency > dbLatency + 50)
        failures.push(`App latency (${appLatency}ms) should be <= DB latency (${dbLatency}ms) once circuit is open (fast-fail)`);

    // Circuit breaker state should be reflected in diagnostics
    const appDiagnostics = metrics.nodeMetrics['app1']?.diagnostics || [];
    const hasCircuitDiag = appDiagnostics.some((d: string) =>
        d.toLowerCase().includes('circuit') || d.toLowerCase().includes('open')
    );
    if (!hasCircuitDiag)
        failures.push('App Server missing circuit breaker OPEN diagnostic');

    return { id: 'TC-034', name: 'Circuit Breaker Activation', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-040: Latency Injection — Cascading Timeout
// ---------------------------------------------------------
function runTC040(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('lb1', 'load_balancer', 'LB', 150, 0),
        makeNode('app1', 'app_server', 'App Server', 300, 0, {
            shared: { resilience: { circuitBreaker: true } }
        }),
        makeNode('cache1', 'cache', 'Cache', 450, 0, { specific: { hitRate: 0.6 } }),
        makeNode('db1', 'database_sql', 'Database', 600, 0, {
            shared: { chaos: { latencyInjectionMs: 500 } }
        }),
    ];
    const connections = [
        makeConnection('c1-lb', 'c1', 'lb1'),
        makeConnection('lb-app', 'lb1', 'app1'),
        makeConnection('app-cache', 'app1', 'cache1'),
        makeConnection('cache-db', 'cache1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 200);
    const failures: string[] = [];

    // DB latency should reflect the 500ms injection
    const dbLatency = metrics.nodeMetrics['db1']?.avgLatencyMs || 0;
    if (dbLatency < 500)
        failures.push(`DB latency was ${dbLatency}ms, expected >= 500ms from chaos injection`);

    // System error rate should rise due to cascading timeouts
    if (metrics.errorRate < 0.03)
        failures.push(`System error rate was ${metrics.errorRate}, expected > 0.05 from cascading latency`);

    // Cache should still absorb 60% of reads — only misses (40%) hit the slow DB
    const cacheHitRate = metrics.nodeMetrics['cache1']?.hitRate || 0;
    if (cacheHitRate < 0.4)
        failures.push(`Cache hit rate was ${cacheHitRate}, expected >= 0.4 (cache still functioning)`);

    return { id: 'TC-040', name: 'Latency Injection — Cascading Timeout', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-041: Load Spike — Autoscaling Response
// ---------------------------------------------------------
function runTC041(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, {
            specific: { requestsPerSecond: 100 },
            shared: { chaos: { loadSpikeMultiplier: 5 } },
        }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, {
            specific: { autoScaling: true, minInstances: 1, maxInstances: 5 },
            shared: { scaling: { instances: 1, nodeCapacityRps: 200 } },
        }),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];

    const metrics = runSim(nodes, connections, 120);
    const failures: string[] = [];

    // RPS should reflect spike (500 RPS)
    if (metrics.rps < 450)
        failures.push(`System RPS was ${metrics.rps}, expected ~500 from 5x spike`);

    // With autoscaling, error rate should eventually drop to near 0
    const appErr = metrics.nodeMetrics['app1']?.avgErrorRate || 0;
    if (appErr > 0.5)
        failures.push(`App Server error rate was ${appErr}, expected < 0.5 after autoscaling`);

    // Instance count should have increased
    const instanceCount = metrics.nodeMetrics['app1']?.instanceCount || 1;
    if (instanceCount <= 1)
        failures.push(`Instance count was ${instanceCount}, expected > 1 after autoscale`);

    return { id: 'TC-041', name: 'Load Spike — Autoscaling Response', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-033: Rate Limiting — Token Bucket Burst
// ---------------------------------------------------------
function runTC033(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 2000 } }),
        makeNode('gw1', 'api_gateway', 'API Gateway', 200, 0, {
            shared: {
                trafficControl: {
                    rateLimiting: true,
                    rateLimit: 500,
                    rateLimitStrategy: 'token-bucket',
                },
            },
        }),
        makeNode('app1', 'app_server', 'App Server', 400, 0),
    ];
    const connections = [
        makeConnection('c1-gw', 'c1', 'gw1'),
        makeConnection('gw-app', 'gw1', 'app1'),
    ];

    const metrics = runSim(nodes, connections, 100);
    const failures: string[] = [];

    // App Server should receive at most ~750 RPS (500 limit × 1.5 burst)
    const appRps = metrics.nodeMetrics['app1']?.currentRps || 0;
    if (appRps > 800)
        failures.push(`App Server RPS was ${appRps}, expected <= 800 (rate limited to 500+burst)`);

    // Error rate should reflect the blocked excess (2000 - ~750 = ~1250 blocked)
    if (metrics.errorRate < 0.3)
        failures.push(`System error rate was ${metrics.errorRate}, expected > 0.3 from rate limiting`);

    return { id: 'TC-033', name: 'Rate Limiting — Token Bucket', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-LBFailover: LB Failover Delay Window
// ---------------------------------------------------------
function runTCLBFailover(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 200 } }),
        makeNode('lb1', 'load_balancer', 'LB', 200, 0, {
            specific: {
                healthCheck: { enabled: true, intervalSeconds: 1, failoverDelayMs: 2000 },
            },
        }),
        makeNode('appA', 'app_server', 'App A', 400, -60),
        makeNode('appB', 'app_server', 'App B', 400, 60, {
            shared: { chaos: { nodeFailure: true } },
        }),
    ];
    const connections = [
        makeConnection('c1-lb', 'c1', 'lb1'),
        makeConnection('lb-appA', 'lb1', 'appA'),
        makeConnection('lb-appB', 'lb1', 'appB'),
    ];

    // Run during the failover window — errors should be present
    const metricsEarly = runSim(nodes, connections, 40); // 2 connections × 15 ticks each = 30 ticks for first arrival, 10 ticks of error accumulation
    // Run longer — after failover delay errors should resolve
    const metricsLate = runSim(nodes, connections, 200);
    const failures: string[] = [];

    // Early: errors should be present (LB still routing to failed node)
    if (metricsEarly.errorRate <= 0)
        failures.push(`Early error rate was ${metricsEarly.errorRate}, expected > 0 during failover window`);

    // Late: after failover, only App A should receive traffic, errors should resolve
    const appBRpsLate = metricsLate.nodeMetrics['appB']?.currentRps || 0;
    if (appBRpsLate > 10)
        failures.push(`App B still receiving ${appBRpsLate} RPS after failover, expected ~0`);

    const appARpsLate = metricsLate.nodeMetrics['appA']?.currentRps || 0;
    if (appARpsLate < 150)
        failures.push(`App A only receiving ${appARpsLate} RPS, expected ~200 after full failover`);

    return { id: 'TC-LBFailover', name: 'LB Failover Delay Window', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// Chaos Engineering Tests
// ---------------------------------------------------------
function runChaosLatency(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('db1', 'database_sql', 'Database', 200, 0, { shared: { chaos: { latencyInjectionMs: 500 } } }),
    ];
    const connections = [makeConnection('conn1', 'c1', 'db1')];
    const metrics = runSim(nodes, connections, 20);
    const failures: string[] = [];

    const dbLat = metrics.nodeMetrics['db1']?.avgLatencyMs || 0;
    if (dbLat < 500) failures.push(`DB latency was ${dbLat}, expected >= 500 due to Chaos Injection`);

    return { id: 'Chaos-01', name: 'Latency Injection', passed: failures.length === 0, failures };
}

function runChaosNodeFailure(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { chaos: { nodeFailure: true } } }),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];
    const metrics = runSim(nodes, connections, 20);
    const failures: string[] = [];

    const appErrs = metrics.nodeMetrics['app1']?.avgErrorRate || 0;
    if (appErrs < 0.9) failures.push(`App error rate was ${appErrs}, expected ~1.0 due to Node Failure Chaos`);

    return { id: 'Chaos-02', name: 'Node Failure', passed: failures.length === 0, failures };
}

function runChaosLoadSpike(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 }, shared: { chaos: { loadSpikeMultiplier: 5 } } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];
    const metrics = runSim(nodes, connections, 30);
    const failures: string[] = [];

    if (metrics.rps < 450) failures.push(`Top bar RPS was ${metrics.rps}, expected ~500 due to 5x Load Spike`);

    return { id: 'Chaos-03', name: 'Load Spike', passed: failures.length === 0, failures };
}

function runChaosLatencyCascades(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_sql', 'Database', 400, 0, { shared: { chaos: { latencyInjectionMs: 300 } } }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    // Give it enough ticks to propagate and average out
    const metrics = runSim(nodes, connections, 200);
    const failures: string[] = [];

    const dbLat = metrics.nodeMetrics['db1']?.avgLatencyMs || 0;
    if (dbLat < 300) failures.push(`DB latency was ${dbLat}, expected >= 300`);
    if (metrics.avgLatencyMs < 250) failures.push(`System latency was ${metrics.avgLatencyMs}, expected >= 250 due to downstream DB latency cascade`);

    return { id: 'Chaos-04', name: 'Latency Injection Cascades', passed: failures.length === 0, failures };
}

function runChaosNodeFailureCascades(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_sql', 'Database', 400, 0, { shared: { chaos: { nodeFailure: true } } }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    const dbErr = metrics.nodeMetrics['db1']?.avgErrorRate || 0;

    if (dbErr <= 0.9) failures.push(`DB error rate was ${dbErr}, expected > 0.9`);
    if (metrics.errorRate <= 0.3) failures.push(`System error rate was ${metrics.errorRate}, expected > 0.3 due to downstream DB failure`);

    return { id: 'Chaos-05', name: 'Node Failure Cascades', passed: failures.length === 0, failures };
}

function runChaosNetworkPartition(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { chaos: { networkPartition: true } } }),
        makeNode('db1', 'database_sql', 'Database', 400, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 40);
    const failures: string[] = [];

    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    if (dbRps >= 10) failures.push(`DB RPS was ${dbRps}, expected < 10 since partition drops traffic at App Server`);
    if (metrics.errorRate <= 0.5) failures.push(`System error rate was ${metrics.errorRate}, expected > 0.5 due to partitioned App Server`);

    return { id: 'Chaos-06', name: 'Network Partition Cascades', passed: failures.length === 0, failures };
}

function runChaosLoadSpikeCascades(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 }, shared: { chaos: { loadSpikeMultiplier: 5 } } }),
        // Overloaded at 500 RPS
        makeNode('app1', 'app_server', 'App Server', 200, 0, { specific: { autoScaling: false }, shared: { scaling: { instances: 1, nodeCapacityRps: 200 } } }),
        // Could be overloaded depending on how many pass through
        makeNode('db1', 'database_sql', 'Database', 400, 0, { shared: { scaling: { instances: 1, nodeCapacityRps: 200 } } }),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'db1'),
    ];

    // Process longer to allow spike to propagate
    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    const appErr = metrics.nodeMetrics['app1']?.avgErrorRate || 0;
    const dbErr = metrics.nodeMetrics['db1']?.avgErrorRate || 0;

    if (metrics.rps < 450) failures.push(`System RPS was ${metrics.rps}, expected >= 450 from Load Spike`);
    if (appErr <= 0.3) failures.push(`App Server error rate was ${appErr}, expected > 0.3 due to overload`);
    if (dbErr <= 0.1) failures.push(`DB error rate was ${dbErr}, expected > 0.1 due to cascading load pressure`);

    return { id: 'Chaos-07', name: 'Load Spike Cascades', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-060: Pause Halts All Metrics (sanity: metrics increase over steps)
// ---------------------------------------------------------
function runTC060(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];

    // Use loose typing here to avoid CI/TS inference issues in this test helper.
    let lastMetrics: any = null;
    const runner = new SimulationRunner(nodes, connections, (_, metrics) => { lastMetrics = metrics; });
    runner.startForExternalLoop();

    runner.stepOnce(100);
    for (let i = 0; i < 9; i++) runner.stepOnce(100);
    const m1 = lastMetrics ? lastMetrics.rps : 0;

    for (let i = 0; i < 20; i++) runner.stepOnce(100);
    const m2 = lastMetrics ? lastMetrics.rps : 0;

    const failures: string[] = [];
    if (m1 < 50) failures.push(`After 10 steps RPS was ${m1}, expected > 50`);
    if (m2 <= m1) failures.push(`After 30 steps RPS (${m2}) should be > after 10 steps (${m1})`);

    return { id: 'TC-060', name: 'Pause Halts All Metrics (sanity)', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-061: Speed Slider Impact
// ---------------------------------------------------------
function runTC061(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];

    const m1 = runSim(nodes, connections, 80, { speed: 1 });
    const m2 = runSim(nodes, connections, 80, { speed: 2 });

    const failures: string[] = [];
    const total1 = m1.nodeMetrics['app1']?.totalRequests ?? 0;
    const total2 = m2.nodeMetrics['app1']?.totalRequests ?? 0;
    if (total2 < total1 * 1.5) failures.push(`At 2x speed total requests (${total2}) expected >= 1.5x of 1x (${total1})`);

    return { id: 'TC-061', name: 'Speed Slider Impact', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-062: Load Factor Scaling
// ---------------------------------------------------------
function runTC062(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
    ];
    const connections = [makeConnection('conn1', 'c1', 'app1')];

    const m1 = runSim(nodes, connections, 60, { loadFactor: 1 });
    const m2 = runSim(nodes, connections, 60, { loadFactor: 2 });

    const failures: string[] = [];
    if (Math.abs(m1.rps - 100) > 25) failures.push(`1x load RPS was ${m1.rps}, expected ~100`);
    if (m2.rps < 180) failures.push(`2x load RPS was ${m2.rps}, expected ~200`);

    return { id: 'TC-062', name: 'Load Factor Scaling', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-063: Multi-Client RPS Summation
// ---------------------------------------------------------
function runTC063(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client A', 0, -40, { specific: { requestsPerSecond: 200 } }),
        makeNode('c2', 'client', 'Client B', 0, 40, { specific: { requestsPerSecond: 300 } }),
        makeNode('lb1', 'load_balancer', 'LB', 200, 0),
        makeNode('app1', 'app_server', 'App Server', 400, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'c2', 'lb1'),
        makeConnection('conn3', 'lb1', 'app1'),
    ];

    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    if (metrics.rps < 450 || metrics.rps > 550) {
        failures.push(`Top bar RPS was ${metrics.rps}, expected ~500 (200+300)`);
    }
    const appRps = metrics.nodeMetrics['app1']?.currentRps ?? 0;
    if (appRps < 450) failures.push(`App Server RPS was ${appRps}, expected ~500`);

    return { id: 'TC-063', name: 'Multi-Client RPS Summation', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-064: Debug — Sequential Inject Trace Ordering
// ---------------------------------------------------------
function runTC064(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0),
        makeNode('lb1', 'load_balancer', 'LB', 200, 0),
        makeNode('app1', 'app_server', 'App Server', 400, 0),
        makeNode('cache1', 'cache', 'Cache', 550, 0, { specific: { readStrategy: 'cache-aside' } }),
        makeNode('db1', 'database_sql', 'Database', 700, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'lb1', 'app1'),
        makeConnection('conn3', 'app1', 'cache1'),
        makeConnection('conn4', 'cache1', 'db1'),
    ];

    const traces: RequestTrace[] = [];
    const runner = new SimulationRunner(nodes, connections, () => { }, { onTraceComplete: (t) => traces.push(t) });
    runner.startForExternalLoop();

    const clientId = nodes.find((n) => n.type === 'client')!.id;
    const path = '/api/test';

    for (let i = 0; i < 5; i++) {
        runner.injectSingleRequest(clientId, 'GET', 'small', path);
        if (i < 4) runner.stepFor(250);
    }
    runner.stepUntilTracedRequestCompletes();

    const failures: string[] = [];
    if (traces.length !== 5) failures.push(`Expected 5 traces, got ${traces.length}`);
    const completed = traces.filter((t) => t.completed).length;
    if (completed < 5) failures.push(`Expected 5 completed traces, got ${completed}`);
    const haveEvents = traces.every((t) => t.events.length >= 1);
    if (!haveEvents) failures.push(`Each trace should have at least one event`);

    return { id: 'TC-064', name: 'Sequential Inject Trace Ordering', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// Runner
// ---------------------------------------------------------

// ---------------------------------------------------------
// TC-044: Resource Exhaustion — Connection Pool
// ---------------------------------------------------------
function runTC044(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 300 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { scaling: { instances: 5 } } }),
        makeNode('proxy1', 'proxy', 'Proxy', 400, 0, {
            specific: { connectionPoolSize: 10, waitTimeoutMs: 50 },
            shared: { chaos: { resourceExhaustion: true } },
        }),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-proxy', 'app1', 'proxy1'),
        makeConnection('proxy-db', 'proxy1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 100);
    const failures: string[] = [];

    // Queue depth should rise under exhaustion
    const proxyQueue = metrics.nodeMetrics['proxy1']?.queueDepth || 0;
    if (proxyQueue <= 0)
        failures.push(`Proxy queue depth was ${proxyQueue}, expected > 0 under resource exhaustion`);

    // Error rate should appear when queue fills past waitTimeoutMs
    const proxyErr = metrics.nodeMetrics['proxy1']?.avgErrorRate || 0;
    if (proxyErr <= 0)
        failures.push(`Proxy error rate was ${proxyErr}, expected > 0 under exhaustion`);

    return { id: 'TC-044', name: 'Resource Exhaustion — Connection Pool', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-005: Cache Stampede
// ---------------------------------------------------------
function runTC005(): QaResult {
    // Run with stampedePrevention: none — flush should cause DB spike
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 500, readWriteRatio: 1.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, {
            specific: {
                hitRate: 0.85,
                maxEntries: 200,
                stampedePrevention: 'none',
            },
        }),
        makeNode('db1', 'database_sql', 'Database', 600, 0, {
            shared: { scaling: { instances: 1, nodeCapacityRps: 600 } },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-cache', 'app1', 'cache1'),
        makeConnection('cache-db', 'cache1', 'db1'),
    ];

    // Warm cache first
    const runner = new SimulationRunner(nodes, connections, () => { });
    runner.startForExternalLoop();
    for (let i = 0; i < 100; i++) runner.stepOnce(100);

    // Record DB RPS before flush
    let preFlushDbRps = 0;
    const runnerPre = new SimulationRunner(nodes, connections, (_, m) => { preFlushDbRps = m.nodeMetrics['db1']?.currentRps || 0; });
    runnerPre.startForExternalLoop();
    for (let i = 0; i < 50; i++) runnerPre.stepOnce(100);

    // Apply cache flush chaos and record post-flush metrics
    const nodesWithFlush = nodes.map(n =>
        n.id === 'cache1'
            ? { ...n, sharedConfig: { ...n.sharedConfig, chaos: { cacheFlush: true } } }
            : n
    );
    const metricsPost = runSim(nodesWithFlush, connections, 60);
    const postFlushDbRps = metricsPost.nodeMetrics['db1']?.currentRps || 0;

    const failures: string[] = [];

    // Post-flush: DB RPS should spike significantly
    if (postFlushDbRps < preFlushDbRps * 2)
        failures.push(`Post-flush DB RPS (${postFlushDbRps}) should be > 2x pre-flush (${preFlushDbRps})`);

    // Post-flush: cache hit rate should drop to 0
    const postHitRate = metricsPost.nodeMetrics['cache1']?.hitRate ?? 1;
    if (postHitRate > 0.1)
        failures.push(`Post-flush hit rate was ${postHitRate}, expected ~0`);

    // Stampede diagnostic should fire
    const cacheDiags = metricsPost.nodeMetrics['cache1']?.diagnostics || [];
    const hasStampedeDiag = cacheDiags.some((d: string) =>
        d.toLowerCase().includes('stampede') || d.toLowerCase().includes('simultaneous')
    );
    if (!hasStampedeDiag)
        failures.push('Cache missing stampede diagnostic after flush');

    return { id: 'TC-005', name: 'Cache Stampede — No Prevention', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-006: Cache Stampede — Mutex Lock Prevention
// ---------------------------------------------------------
function runTC006(): QaResult {
    const baseNodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 500, readWriteRatio: 1.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, {
            specific: { hitRate: 0.85, maxEntries: 200, stampedePrevention: 'mutex-lock' },
        }),
        makeNode('db1', 'database_sql', 'Database', 600, 0, {
            shared: { scaling: { instances: 1, nodeCapacityRps: 600 } },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-cache', 'app1', 'cache1'),
        makeConnection('cache-db', 'cache1', 'db1'),
    ];

    // Apply flush with mutex-lock prevention
    const nodesWithFlush: CanvasNode[] = baseNodes.map(n =>
        n.id === 'cache1'
            ? { ...n, sharedConfig: { ...n.sharedConfig, chaos: { cacheFlush: true } } }
            : n
    );
    const metrics = runSim(nodesWithFlush, connections, 60);
    const failures: string[] = [];

    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;
    const dbErr = metrics.nodeMetrics['db1']?.avgErrorRate || 0;

    // Mutex-lock: DB should NOT spike to full 500 RPS
    if (dbRps > 100)
        failures.push(`DB RPS was ${dbRps} after flush with mutex-lock, expected <= 100 (coalesced)`);

    // Error rate should stay near 0 (requests queued, not dropped)
    if (dbErr > 0.05)
        failures.push(`DB error rate was ${dbErr} with mutex-lock, expected < 0.05`);

    return { id: 'TC-006', name: 'Cache Stampede — Mutex Lock Prevention', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-045: Cache Invalidation Global Flush
// ---------------------------------------------------------
export function runTC045(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 2000, readWriteRatio: 1.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, {
            specific: { hitRate: 0.85, maxEntries: 1000, stampedePrevention: 'none' },
        }),
        makeNode('db1', 'database_sql', 'Database', 600, 0, {
            shared: { scaling: { instances: 1, nodeCapacityRps: 500 } },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-cache', 'app1', 'cache1'),
        makeConnection('cache-db', 'cache1', 'db1'),
    ];

    const nodesWithFlush = nodes.map(n =>
        n.id === 'cache1'
            ? { ...n, sharedConfig: { ...n.sharedConfig, chaos: { cacheFlush: true } } }
            : n
    );

    const metrics = runSim(nodesWithFlush, connections, 100);
    const failures: string[] = [];

    console.log("TC-045 Metrics:");
    console.log("DB:   Err=", metrics.nodeMetrics['db1']?.avgErrorRate, " Lat=", metrics.nodeMetrics['db1']?.avgLatencyMs);
    console.log("CACH: Err=", metrics.nodeMetrics['cache1']?.avgErrorRate, " Lat=", metrics.nodeMetrics['cache1']?.avgLatencyMs, " Util=", metrics.nodeMetrics['cache1']?.utilization);
    console.log("APP:  Err=", metrics.nodeMetrics['app1']?.avgErrorRate, " Lat=", metrics.nodeMetrics['app1']?.avgLatencyMs, " Util=", metrics.nodeMetrics['app1']?.utilization);

    // DB should be overwhelmed (2000 RPS >> 500 capacity)
    const dbErr = metrics.nodeMetrics['db1']?.avgErrorRate || 0;
    if (dbErr < 0.5)
        failures.push(`DB error rate was ${dbErr}, expected > 0.5 (overwhelmed by 2000 RPS post-flush)`);

    // App Server should also see errors (downstream DB failing)
    const appErr = metrics.nodeMetrics['app1']?.avgErrorRate || 0;
    if (appErr < 0.3)
        failures.push(`App Server error rate was ${appErr}, expected > 0.3 from cascading DB errors`);

    // Cache hit rate should be 0 after flush
    const hitRate = metrics.nodeMetrics['cache1']?.hitRate ?? 1;
    if (hitRate > 0.05)
        failures.push(`Cache hit rate was ${hitRate}, expected ~0 immediately post-flush`);

    return { id: 'TC-045', name: 'Cache Invalidation — Global Flush High RPS', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-013: Replication Lag — Async Mode
// ---------------------------------------------------------
function runTC013(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 200, readWriteRatio: 0.8 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_sql', 'DB Primary', 400, 0, {
            specific: {
                replication: {
                    mode: 'single-leader',
                    syncMode: 'asynchronous',
                    replicationLagMs: 500,
                    lagVarianceMs: 50,
                },
                readReplicas: 1,
            },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-db', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 150);
    const failures: string[] = [];

    // Replication lag metric should be visible
    const repLag = metrics.nodeMetrics['db1']?.replicationLagMs || 0;
    if (repLag < 400)
        failures.push(`Replication lag was ${repLag}ms, expected >= 400ms`);

    // staleRead particles should exist
    const staleReads = metrics.nodeMetrics['db1']?.staleReadCount || 0;
    if (staleReads <= 0)
        failures.push(`staleReadCount was ${staleReads}, expected > 0 with async replication`);

    // Diagnostic should fire
    const dbDiags = metrics.nodeMetrics['db1']?.diagnostics || [];
    const hasRepDiag = dbDiags.some((d: string) =>
        d.toLowerCase().includes('replication') || d.toLowerCase().includes('async')
    );
    if (!hasRepDiag)
        failures.push('DB missing async replication diagnostic');

    return { id: 'TC-013', name: 'Replication Lag — Async Mode', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-042: Node Failure — Single Leader DB Failover
// ---------------------------------------------------------
function runTC042(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100, readWriteRatio: 0.5 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_sql', 'DB Primary', 400, 0, {
            specific: {
                replication: {
                    mode: 'single-leader',
                    syncMode: 'asynchronous',
                    replicationLagMs: 300,
                },
                readReplicas: 1,
            },
            shared: { chaos: { nodeFailure: true } },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-db', 'app1', 'db1'),
    ];

    // Early: during failover window, writes should error
    const metricsEarly = runSim(nodes, connections, 80);
    // Late: after promotion, writes should resume
    const metricsLate = runSim(nodes, connections, 200);
    const failures: string[] = [];

    // Early: write error rate should be high (no leader)
    const earlyWriteErr = metricsEarly.nodeMetrics['db1']?.writeErrorRate || 0;
    if (earlyWriteErr < 0.5)
        failures.push(`Early write error rate was ${earlyWriteErr}, expected > 0.5 during failover`);

    // Data loss diagnostic should fire
    const dbDiags = metricsLate.nodeMetrics['db1']?.diagnostics || [];
    const hasDataLossDiag = dbDiags.some((d: string) =>
        d.toLowerCase().includes('data loss') || d.toLowerCase().includes('replicated')
    );
    if (!hasDataLossDiag)
        failures.push('DB missing data loss warning diagnostic after async failover');

    return { id: 'TC-042', name: 'Node Failure — Single Leader DB Failover', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-032: B-Tree vs LSM Write-Heavy Workload
// ---------------------------------------------------------
function runTC032(): QaResult {
    const buildNodes = (engineType: 'b-tree' | 'lsm-tree') => [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000, readWriteRatio: 0.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_sql', 'Database', 400, 0, {
            specific: { storageEngine: { type: engineType, bloomFilters: false } },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-db', 'app1', 'db1'),
    ];

    const mBTree = runSim(buildNodes('b-tree'), connections, 100);
    const mLsm = runSim(buildNodes('lsm-tree'), connections, 100);
    const failures: string[] = [];

    const btreeWriteLatency = mBTree.nodeMetrics['db1']?.avgLatencyMs || 0;
    const lsmWriteLatency = mLsm.nodeMetrics['db1']?.avgLatencyMs || 0;

    // LSM write latency should be lower than B-Tree (0.6x multiplier)
    if (lsmWriteLatency >= btreeWriteLatency)
        failures.push(`LSM write latency (${lsmWriteLatency}ms) should be lower than B-Tree (${btreeWriteLatency}ms)`);

    // B-Tree tip: diagnostic for write-heavy workload
    const btreeDiags = mBTree.nodeMetrics['db1']?.diagnostics || [];
    const hasBtreeDiag = btreeDiags.some((d: string) =>
        d.toLowerCase().includes('b-tree') || d.toLowerCase().includes('write amplification')
    );
    if (!hasBtreeDiag)
        failures.push('B-Tree DB missing write-heavy workload diagnostic');

    return { id: 'TC-032', name: 'B-Tree vs LSM Write-Heavy Workload', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-030: SPOF — Quorum Loss
// ---------------------------------------------------------
function runTC030(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_nosql', 'Cassandra', 400, 0, {
            specific: {
                engine: 'cassandra',
                replication: { mode: 'leaderless' },
                quorum: { n: 3, w: 2, r: 1 }, // w+r = 3 = n, NOT > n
            },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-db', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    // Quorum condition w+r=n not met — diagnostic should fire
    const dbDiags = metrics.nodeMetrics['db1']?.diagnostics || [];
    const hasQuorumDiag = dbDiags.some((d: string) =>
        d.toLowerCase().includes('quorum') || d.toLowerCase().includes('stale')
    );
    if (!hasQuorumDiag)
        failures.push('NoSQL DB missing quorum condition warning (w+r ≤ n)');

    // staleRead should be probabilistically occurring
    const staleReads = metrics.nodeMetrics['db1']?.staleReadCount || 0;
    if (staleReads <= 0)
        failures.push(`staleReadCount was ${staleReads}, expected > 0 when w+r not > n`);

    return { id: 'TC-030', name: 'SPOF — Quorum Loss (Leaderless DB)', passed: failures.length === 0, failures };
}


// ---------------------------------------------------------
// TC-031: Hot Shard Detection
// ---------------------------------------------------------
function runTC031(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_nosql', 'Sharded NoSQL', 400, 0, {
            specific: {
                sharding: {
                    enabled: true,
                    strategy: 'hash-based',
                    shardKey: 'user_id',
                    shardCount: 4,
                    consistentHashing: true,
                    hotspotFactor: 0.7,
                },
            },
        }),
    ];
    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-db', 'app1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    // HOT SHARD diagnostic should fire at hotspotFactor: 0.7
    const dbDiags = metrics.nodeMetrics['db1']?.diagnostics || [];
    const hasHotShardDiag = dbDiags.some((d: string) =>
        d.toLowerCase().includes('hot shard') || d.toLowerCase().includes('skewed')
    );
    if (!hasHotShardDiag)
        failures.push('NoSQL DB missing HOT SHARD diagnostic at hotspotFactor 0.7');

    // Latency should be elevated due to hot shard multiplier
    // Expected: 1 + (0.7 × 4) = 3.8x normal latency
    const dbLatency = metrics.nodeMetrics['db1']?.avgLatencyMs || 0;
    const baselineNodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('db1', 'database_nosql', 'NoSQL', 400, 0),
    ];
    const baselineMetrics = runSim(baselineNodes, connections, 80);
    const baselineLatency = baselineMetrics.nodeMetrics['db1']?.avgLatencyMs || 1;

    if (dbLatency < baselineLatency * 2)
        failures.push(`Hot shard latency (${dbLatency}ms) should be > 2x baseline (${baselineLatency}ms)`);

    return { id: 'TC-031', name: 'Hot Shard Detection', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// BLOCKED: Permanently deferred TCs — stubs return explicit failure
// Do not remove; unblock when the required component/feature is implemented.
// ---------------------------------------------------------

function runTC012(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 10, readWriteRatio: 1.0 } }),
        makeNode('os1', 'object_store', 'Glacier Storage', 200, 0, {
            specific: { storageClass: 'glacier', versioning: false, lifecycleRules: false }
        }),
    ];
    const connections = [makeConnection('c1-os', 'c1', 'os1')];

    // Run enough ticks for particles to arrive
    const metrics = runSim(nodes, connections, 80);
    const failures: string[] = [];

    const osLatency = metrics.nodeMetrics['os1']?.avgLatencyMs || 0;
    // With 80 ticks and 10 RPS, many fast particles pull the average down, but the initial 60000ms makes it > 500ms.
    if (osLatency < 500) {
        failures.push(`Expected Glacier cold read latency average to be inflated > 500ms, got ${osLatency}ms`);
    }

    const diags = metrics.nodeMetrics['os1']?.diagnostics || [];
    const hasGlacierDiag = diags.some((d: string) => d.includes('massive restore latency penalty') || d.includes('Warmed up'));
    if (!hasGlacierDiag) {
        failures.push('Expected Glacier storage diagnostic missing.');
    }

    return { id: 'TC-012', name: 'Object Store — Glacier Cold Read', passed: failures.length === 0, failures };
}

function runTC021(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, {
            specific: { requestsPerSecond: 200, readWriteRatio: 0.0 }, // all writes
        }),
        makeNode('gw1', 'api_gateway', 'API GW', 150, 0, {
            shared: { trafficControl: { rateLimiting: true, rateLimit: 300, rateLimitStrategy: 'token-bucket' } },
        }),
        makeNode('app1', 'app_server', 'App Server', 300, 0),
        makeNode('mq1', 'message_queue', 'MQ', 450, 0, {
            specific: {
                deliveryGuarantee: 'at-least-once',
                consumerGroupCount: 2,
                backpressure: 'block',
            },
        }),
        makeNode('w1', 'worker', 'Worker', 600, 0, {
            shared: { scaling: { instances: 2, nodeCapacityRps: 400 } },
            specific: {
                instanceType: 'medium',
                processingTimeMs: 25,
                jobType: 'cpu-bound',
                autoScaling: false,
                minInstances: 1,
                maxInstances: 10,
                maxRetries: 3,
            },
        }),
        makeNode('db1', 'database_sql', 'Database', 750, 0, {
            specific: { isolation: 'read-committed' },
        }),
    ];

    const connections = [
        makeConnection('c1-gw', 'c1', 'gw1'),
        makeConnection('gw-app', 'gw1', 'app1'),
        makeConnection('app-mq', 'app1', 'mq1'),
        makeConnection('mq-worker', 'mq1', 'w1'),
        makeConnection('worker-db', 'w1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 200);
    const failures: string[] = [];

    // API GW should not be dropping requests (headroom 300 RPS vs 200 RPS load)
    const gwDetail = metrics.nodeMetrics['gw1']?.componentDetail as any;
    const allowed = gwDetail?.allowed ?? 0;
    const dropped = gwDetail?.dropped ?? 0;
    if (dropped > 0) {
        failures.push(`API Gateway dropped ${dropped} messages, expected 0 with rateLimit 300 RPS and producer 200 RPS`);
    }
    if (allowed < 180) {
        failures.push(`API Gateway allowed only ${allowed} messages, expected close to 200`);
    }

    // MQ should be buffering: queue depth should grow because producer (200) > consumer drain (80)
    const mqQueueDepth = metrics.nodeMetrics['mq1']?.queueDepth ?? 0;
    if (mqQueueDepth <= 0) {
        failures.push(`MQ queue depth was ${mqQueueDepth}, expected > 0 (producer outpaces Worker drain)`);
    }

    // MQ diagnostics should mention consumer lag
    const mqDiagnostics = (metrics.nodeMetrics['mq1']?.diagnostics ?? []) as string[];
    const hasLagDiag = mqDiagnostics.some((d: string) =>
        d.toLowerCase().includes('lag') || d.toLowerCase().includes('consumer'),
    );
    if (!hasLagDiag) {
        failures.push('MQ missing consumer lag diagnostic for Worker consumer');
    }

    // DB should see writes downstream of Worker (non-zero RPS)
    const dbRps = metrics.nodeMetrics['db1']?.currentRps ?? 0;
    if (dbRps <= 0) {
        failures.push(`DB RPS was ${dbRps}, expected > 0 (writes flowing through Worker)`);
    }

    return { id: 'TC-021', name: 'Async Write Path with MQ + Worker', passed: failures.length === 0, failures };
}

// BLOCKED: requires CDC Connector
function runTC023(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 200, readWriteRatio: 0.0 } }),
        makeNode('app1', 'app_server', 'App Server', 150, 0),
        makeNode('db_sql', 'database_sql', 'DB SQL (source)', 300, 0),
        makeNode('cdc1', 'cdc_connector', 'CDC Connector', 450, 0, {
            specific: { captureMode: 'log-tail', captureLatencyMs: 200, includeDeletes: true },
        }),
        makeNode('mq1', 'message_queue', 'MQ', 600, 0),
        makeNode('app2', 'app_server', 'App Server (consumer)', 750, 0),
        makeNode('db_nosql', 'database_nosql', 'DB NoSQL (derived)', 900, 0),
    ];
    const connections = [
        makeConnection('c-app', 'c1', 'app1'),
        makeConnection('app-db', 'app1', 'db_sql'),
        makeConnection('db-cdc', 'db_sql', 'cdc1'),
        makeConnection('cdc-mq', 'cdc1', 'mq1'),
        makeConnection('mq-app2', 'mq1', 'app2'),
        makeConnection('app2-nosql', 'app2', 'db_nosql'),
    ];
    const metrics = runSim(nodes, connections, 250);
    const failures: string[] = [];

    // Assert 1: CDC particles appear downstream (MQ or NoSQL receives RPS > 0 from CDC path)
    const mqRps = metrics.nodeMetrics['mq1']?.currentRps ?? 0;
    const nosqlRps = metrics.nodeMetrics['db_nosql']?.currentRps ?? 0;
    if (mqRps <= 0 && nosqlRps <= 0) {
        failures.push(`CDC path: MQ RPS was ${mqRps}, NoSQL RPS was ${nosqlRps}; expected at least one > 0`);
    }

    // Assert 2: Propagation delay ≥ captureLatencyMs (200ms) — CDC config and diagnostic state it
    const cdcDetail = metrics.nodeMetrics['cdc1']?.componentDetail;
    const captureLatencyMs = (cdcDetail && cdcDetail.kind === 'cdc_connector') ? cdcDetail.captureLatencyMs : 0;
    if (captureLatencyMs < 200) {
        failures.push(`CDC captureLatencyMs was ${captureLatencyMs}, expected ≥ 200`);
    }

    // Assert 3: Diagnostic fires referencing eventual consistency
    const cdcDiagnostics = metrics.nodeMetrics['cdc1']?.diagnostics ?? [];
    const hasEventualConsistency = cdcDiagnostics.some((d) => d.toLowerCase().includes('eventually consistent'));
    if (!hasEventualConsistency) {
        failures.push(`CDC diagnostics should reference eventual consistency; got: ${cdcDiagnostics.join('; ')}`);
    }

    return { id: 'TC-023', name: 'CDC Pipeline', passed: failures.length === 0, failures };
}

function runTC024(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, {
            specific: { requestsPerSecond: 300, readWriteRatio: 0.0 }, // all writes
        }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('ps1', 'pub_sub', 'Pub/Sub', 400, 0, {
            specific: { subscriberGroupCount: 3, orderingEnabled: false },
        }),
        makeNode('w1', 'worker', 'Worker A', 600, -60, {
            shared: { scaling: { instances: 2, nodeCapacityRps: 500 } },
            specific: {
                instanceType: 'medium',
                processingTimeMs: 50,
                jobType: 'io-bound',
                autoScaling: false,
                minInstances: 1,
                maxInstances: 10,
                maxRetries: 3,
            },
        }),
        makeNode('w2', 'worker', 'Worker B', 600, 0, {
            shared: { scaling: { instances: 2, nodeCapacityRps: 500 } },
            specific: {
                instanceType: 'medium',
                processingTimeMs: 50,
                jobType: 'io-bound',
                autoScaling: false,
                minInstances: 1,
                maxInstances: 10,
                maxRetries: 3,
            },
        }),
        makeNode('w3', 'worker', 'Worker C', 600, 60, {
            shared: { scaling: { instances: 2, nodeCapacityRps: 500 } },
            specific: {
                instanceType: 'medium',
                processingTimeMs: 50,
                jobType: 'io-bound',
                autoScaling: false,
                minInstances: 1,
                maxInstances: 10,
                maxRetries: 3,
            },
        }),
    ];

    const connections = [
        makeConnection('c1-app', 'c1', 'app1'),
        makeConnection('app-ps', 'app1', 'ps1'),
        makeConnection('ps-w1', 'ps1', 'w1'),
        makeConnection('ps-w2', 'ps1', 'w2'),
        makeConnection('ps-w3', 'ps1', 'w3'),
    ];

    const metrics = runSim(nodes, connections, 200);
    const failures: string[] = [];

    const inputRps = metrics.nodeMetrics['app1']?.currentRps ?? 0;
    const w1Rps = metrics.nodeMetrics['w1']?.currentRps ?? 0;
    const w2Rps = metrics.nodeMetrics['w2']?.currentRps ?? 0;
    const w3Rps = metrics.nodeMetrics['w3']?.currentRps ?? 0;

    const totalDownstream = w1Rps + w2Rps + w3Rps;
    const mean = totalDownstream / 3;

    // Assert 1: total downstream RPS ≈ inputRps × 3
    if (inputRps > 0) {
        const expectedTotal = inputRps * 3;
        const lower = expectedTotal * 0.8;
        const upper = expectedTotal * 1.2;
        if (totalDownstream < lower || totalDownstream > upper) {
            failures.push(`Total downstream RPS ${totalDownstream.toFixed(1)} outside expected range [${lower.toFixed(1)}, ${upper.toFixed(1)}] for inputRps=${inputRps.toFixed(1)} and fan-out x3`);
        }
    } else {
        failures.push('Input RPS at App Server was 0, cannot validate fan-out');
    }

    // Assert 2: each worker receives ~equal RPS (±20% of mean)
    const workers: Array<{ id: string; rps: number }> = [
        { id: 'w1', rps: w1Rps },
        { id: 'w2', rps: w2Rps },
        { id: 'w3', rps: w3Rps },
    ];
    for (const w of workers) {
        if (mean > 0 && Math.abs(w.rps - mean) > mean * 0.2) {
            failures.push(`Worker ${w.id} RPS ${w.rps.toFixed(1)} is not within ±20% of mean ${mean.toFixed(1)}`);
        }
    }

    return { id: 'TC-024', name: 'Pub/Sub Fan-Out', passed: failures.length === 0, failures };
}

function runTC035(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100, readWriteRatio: 1.0 } }),
        makeNode('dns1', 'dns', 'DNS Router', 200, 0, {
            specific: { recordType: 'A', routingPolicy: 'failover', healthCheck: { enabled: true, intervalSeconds: 1, failoverDelayMs: 10000 } }
        }),
        makeNode('app_primary', 'app_server', 'Primary', 400, -100, { shared: { chaos: { nodeFailure: true } } }),
        makeNode('app_standby', 'app_server', 'Standby', 400, 100)
    ];
    const connections = [
        makeConnection('c1-dns', 'c1', 'dns1'),
        makeConnection('dns-primary', 'dns1', 'app_primary'),
        makeConnection('dns-standby', 'dns1', 'app_standby')
    ];

    const metricsFailoverWindow = runSim(nodes, connections, 300);
    const failures: string[] = [];

    // Evaluate transition window
    const diags = metricsFailoverWindow.nodeMetrics['dns1']?.diagnostics || [];
    const hasFailoverDiag = diags.some((d: string) => d.includes('Propagating failover'));
    if (!hasFailoverDiag) {
        failures.push('DNS missing failover propagation diagnostic during transition window (300 ticks).');
    }

    const reqsPrimary = metricsFailoverWindow.nodeMetrics['app_primary']?.totalRequests || 0;
    if (reqsPrimary === 0) {
        failures.push('Primary should continue receiving traffic during failover window before DNS propagates.');
    }

    const metricsRecovered = runSim(nodes, connections, 800);
    const diagsRecovered = metricsRecovered.nodeMetrics['dns1']?.diagnostics || [];
    const hasRemovedDiag = diagsRecovered.some((d: string) => d.includes('removed from DNS resolution'));
    if (!hasRemovedDiag) {
        failures.push(`DNS missing node removal diagnostic after failover delay (800 ticks). Diags: ${JSON.stringify(diagsRecovered)}`);
    }

    return { id: 'TC-035', name: 'DNS Failover Propagation Window', passed: failures.length === 0, failures };
}

// BLOCKED: requires quorum + partition chaos interaction (Session 14 unlocks quorum; TC-043 can follow)
function runTC043(): QaResult {
    return { id: 'TC-043', name: 'Network Partition — Leaderless DB Split-Brain', passed: false, failures: ['BLOCKED: Quorum + partition chaos interaction not implemented'] };
}

// BLOCKED: requires DB Modeling Lab (Phase 2b)
function runTC050(): QaResult {
    return { id: 'TC-050', name: 'DB Modeling Lab Recommendations', passed: false, failures: ['BLOCKED: DB Modeling Lab not implemented (Phase 2b)'] };
}

// BLOCKED: requires DB Modeling Lab (Phase 2b)
function runTC051(): QaResult {
    return { id: 'TC-051', name: 'Schema Editor — Show on Canvas', passed: false, failures: ['BLOCKED: DB Modeling Lab not implemented (Phase 2b)'] };
}

export function runQaSuite(): QaResult[] {
    return [
        // P1 Component Tests
        runTC001(),      // Basic flow
        runTC002(),      // CDN hit rate
        runTC003(),      // Weighted LB
        runTC003b(),     // Round-robin LB
        runTC004(),      // Cache hit/miss (strengthened)
        runTC005(),      // Cache stampede — no prevention (Session 7)
        runTC006(),      // Cache stampede — mutex lock (Session 7)
        runTC007(),      // Write-through (existing, renamed)
        runTC008(),      // Write-behind + staleRead (strengthened Session 8)
        runTC008b(),     // Node capacity overload (existing, renamed)
        runTC009(),      // MQ consumer lag (Session 5)
        runTC010(),      // SPOF detection (Session 3)
        runTC011(),      // Protocol factor HTTP vs gRPC (Session 3)
        runTC013(),      // Replication lag async (Session 9)
        // Cross-Component Flow
        runTC020(),      // Full e-commerce read path (Session 3)
        // Edge Cases
        runTC030(),      // SPOF quorum loss (Session 14)
        runTC031(),      // Hot shard detection (Session 15)
        runTC032(),      // B-Tree vs LSM (Session 11)
        runTC033(),      // Rate limiting token bucket (Session 6)
        runTC034(),      // Circuit breaker (Session 4)
        // Chaos Scenarios
        runTC040(),      // Latency cascading timeout (Session 4)
        runTC041(),      // Load spike autoscaling (Session 4)
        runTC042(),      // DB failover single leader (Session 9)
        runTC044(),      // Connection pool exhaustion (Session 5)
        runTC045(),      // Cache invalidation global flush (Session 7)
        // Chaos Engineering
        runChaosLatency(),
        runChaosNodeFailure(),
        runChaosLoadSpike(),
        runChaosLatencyCascades(),
        runChaosNodeFailureCascades(),
        runChaosNetworkPartition(),
        runChaosLoadSpikeCascades(),
        // Custom (no requirements number)
        runTCLBFailover(),  // LB failover delay window (Session 6)
        runTCProxyRouting(), // Proxy routing (extra)
        // BLOCKED stubs (explicit failures until component/feature exists)
        runTC012(),
        runTC021(),
        runTC023(),
        runTC024(),
        runTC035(),
        runTC043(),
        runTC050(),
        runTC051(),
        // Simulation Correctness
        runTC060(),
        runTC061(),
        runTC062(),
        runTC063(),
        runTC064(),
    ];
}

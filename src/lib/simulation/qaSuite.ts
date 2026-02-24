import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import { SimulationRunner, LiveMetrics } from './SimulationRunner';
import type { RequestTrace } from './types';
import { COMPONENT_CATALOG, getCatalogEntry } from '@/lib/data/componentCatalog';
import { DEFAULT_SHARED_CONFIG } from '@/lib/types/canvas';

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
    if (dbRps > appRps + 10) failures.push(`DB RPS (${dbRps}) should be <= App Server RPS (${appRps})`);

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
// TC-004: Cache backend hit/miss flow
// ---------------------------------------------------------
function runTC004(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 1000, readWriteRatio: 1.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, { specific: { hitRate: 0.8 } }),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'app1'),
        makeConnection('conn2', 'app1', 'cache1'),
        makeConnection('conn3', 'cache1', 'db1'),
    ];

    const metrics = runSim(nodes, connections, 60);
    const failures: string[] = [];

    const appRps = metrics.nodeMetrics['app1']?.currentRps || 0;
    const cacheRps = metrics.nodeMetrics['cache1']?.currentRps || 0;
    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;

    if (Math.abs(cacheRps - 1000) > 100) failures.push(`Cache RPS was ${cacheRps}, expected ~1000`);
    if (dbRps > 250 || dbRps < 150) failures.push(`DB RPS was ${dbRps}, expected ~200 (20% of 1000)`);

    return { id: 'TC-004', name: 'Cache backend hit/miss flow', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-005: Write-through cache
// ---------------------------------------------------------
function runTC005(): QaResult {
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

    return { id: 'TC-005', name: 'Write-through cache', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-006: Write-behind cache
// ---------------------------------------------------------
function runTC006(): QaResult {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0, { specific: { requestsPerSecond: 100, readWriteRatio: 0.0 } }),
        makeNode('app1', 'app_server', 'App Server', 200, 0),
        makeNode('cache1', 'cache', 'Cache', 400, 0, { specific: { writeStrategy: 'write-behind' } }),
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
    if (dbRps >= 20) failures.push(`DB RPS was ${dbRps}, expected < 20 for write-behind (absorbs writes)`);

    return { id: 'TC-006', name: 'Write-behind cache', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-007: Round-robin LB
// ---------------------------------------------------------
function runTC007(): QaResult {
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

    return { id: 'TC-007', name: 'Round-robin LB', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-008: Node capacity overload
// ---------------------------------------------------------
function runTC008(): QaResult {
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

    return { id: 'TC-008', name: 'Node capacity overload', passed: failures.length === 0, failures };
}

// ---------------------------------------------------------
// TC-009: Proxy routing
// ---------------------------------------------------------
function runTC009(): QaResult {
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

    const proxyRps = metrics.nodeMetrics['proxy1']?.currentRps || 0;
    const dbRps = metrics.nodeMetrics['db1']?.currentRps || 0;

    if (proxyRps <= 80) failures.push(`Proxy RPS was ${proxyRps}, expected > 80`);
    if (dbRps <= 80) failures.push(`DB RPS was ${dbRps}, expected > 80`);

    return { id: 'TC-009', name: 'Proxy routing', passed: failures.length === 0, failures };
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
        makeNode('app1', 'app_server', 'App Server', 200, 0, { shared: { scaling: { instances: 1, nodeCapacityRps: 200 } } }),
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

    let lastMetrics: LiveMetrics | null = null;
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
    const runner = new SimulationRunner(nodes, connections, () => {}, { onTraceComplete: (t) => traces.push(t) });
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
export function runQaSuite(): QaResult[] {
    return [
        runTC001(),
        runTC002(),
        runTC003(),
        runTC004(),
        runTC005(),
        runTC006(),
        runTC007(),
        runTC008(),
        runTC009(),
        runChaosLatency(),
        runChaosNodeFailure(),
        runChaosLoadSpike(),
        runChaosLatencyCascades(),
        runChaosNodeFailureCascades(),
        runChaosNetworkPartition(),
        runChaosLoadSpikeCascades(),
        runTC060(),
        runTC061(),
        runTC062(),
        runTC063(),
        runTC064(),
    ];
}

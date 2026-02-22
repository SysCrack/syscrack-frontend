/**
 * Baseline capture for DAG trace model verification.
 *
 * Runs S1-S10 scenarios with the current flat trace model and records
 * trace events, completion status, and metrics. Used to verify no
 * regressions after implementing the DAG model.
 */
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import { SimulationRunner } from './SimulationRunner';
import type { RequestTrace } from './types';
import { COMPONENT_CATALOG, getCatalogEntry } from '@/lib/data/componentCatalog';
import { DEFAULT_SHARED_CONFIG } from '@/lib/types/canvas';

export interface BaselineTraceResult {
    traceId: string;
    events: Array<{ nodeId: string; nodeType: string; action: string; timestamp: number }>;
    completed: boolean;
    eventCount: number;
}

export interface BaselineScenarioResult {
    scenario: string;
    topology: string;
    traces: BaselineTraceResult[];
    metrics?: { rps?: number; avgLatencyMs?: number; errorRate?: number };
}

export interface BaselineCaptureResult {
    capturedAt: string;
    modelVersion: 'flat' | 'dag';
    scenarios: BaselineScenarioResult[];
}

function makeNode(
    id: string,
    type: string,
    name: string,
    x: number,
    y: number,
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
        sharedConfig: { ...sharedConfig },
        specificConfig: { ...specificConfig },
    };
}

function makeConnection(id: string, sourceId: string, targetId: string): CanvasConnection {
    return { id, sourceId, targetId, protocol: 'http', bidirectional: false };
}

/** S1: Client -> LB -> AppServer -> DB */
function buildS1(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0),
        makeNode('lb1', 'load_balancer', 'Load Balancer', 200, 0),
        makeNode('app1', 'app_server', 'App Server', 400, 0),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'lb1', 'app1'),
        makeConnection('conn3', 'app1', 'db1'),
    ];
    return { nodes, connections };
}

/** S2: Client -> LB -> AppServer -> Cache -> DB (cache read hit) */
function buildS2(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0),
        makeNode('lb1', 'load_balancer', 'Load Balancer', 150, 0),
        makeNode('app1', 'app_server', 'App Server', 300, 0),
        makeNode('cache1', 'cache', 'Cache', 450, 0),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'lb1', 'app1'),
        makeConnection('conn3', 'app1', 'cache1'),
        makeConnection('conn4', 'cache1', 'db1'),
    ];
    return { nodes, connections };
}

/** S3: Same as S2 (cache read miss - first request always misses) */
function buildS3() {
    return buildS2();
}

/** S4: Same as S1 (simple write - current model treats as generic request) */
function buildS4() {
    return buildS1();
}

/** S5: Client -> LB -> App -> Cache -> DB, cache write-through */
function buildS5(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const { nodes, connections } = buildS2();
    const cacheNode = nodes.find((n) => n.id === 'cache1');
    if (cacheNode && cacheNode.specificConfig && typeof cacheNode.specificConfig === 'object') {
        (cacheNode.specificConfig as Record<string, unknown>).writeStrategy = 'write-through';
    }
    return { nodes, connections };
}

/** S6: Same as S5 but write-behind */
function buildS6(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const { nodes, connections } = buildS2();
    const cacheNode = nodes.find((n) => n.id === 'cache1');
    if (cacheNode && cacheNode.specificConfig && typeof cacheNode.specificConfig === 'object') {
        (cacheNode.specificConfig as Record<string, unknown>).writeStrategy = 'write-behind';
    }
    return { nodes, connections };
}

/** S7: Same as S5 but write-around */
function buildS7(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const { nodes, connections } = buildS2();
    const cacheNode = nodes.find((n) => n.id === 'cache1');
    if (cacheNode && cacheNode.specificConfig && typeof cacheNode.specificConfig === 'object') {
        (cacheNode.specificConfig as Record<string, unknown>).writeStrategy = 'write-around';
    }
    return { nodes, connections };
}

/** S8: Client -> CDN -> LB -> AppServer -> DB */
function buildS8(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0),
        makeNode('cdn1', 'cdn', 'CDN', 150, 0),
        makeNode('lb1', 'load_balancer', 'Load Balancer', 300, 0),
        makeNode('app1', 'app_server', 'App Server', 450, 0),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'cdn1'),
        makeConnection('conn2', 'cdn1', 'lb1'),
        makeConnection('conn3', 'lb1', 'app1'),
        makeConnection('conn4', 'app1', 'db1'),
    ];
    return { nodes, connections };
}

/** S9: Same as S8 (CDN write pass-through) */
function buildS9() {
    return buildS8();
}

/** S10: Client -> LB -> 3x AppServer -> DB */
function buildS10(): { nodes: CanvasNode[]; connections: CanvasConnection[] } {
    const nodes = [
        makeNode('c1', 'client', 'Client', 0, 0),
        makeNode('lb1', 'load_balancer', 'Load Balancer', 200, 0),
        makeNode('app1', 'app_server', 'App Server 1', 400, -60),
        makeNode('app2', 'app_server', 'App Server 2', 400, 0),
        makeNode('app3', 'app_server', 'App Server 3', 400, 60),
        makeNode('db1', 'database_sql', 'Database', 600, 0),
    ];
    const connections = [
        makeConnection('conn1', 'c1', 'lb1'),
        makeConnection('conn2', 'lb1', 'app1'),
        makeConnection('conn3', 'lb1', 'app2'),
        makeConnection('conn4', 'lb1', 'app3'),
        makeConnection('conn5', 'app1', 'db1'),
        makeConnection('conn6', 'app2', 'db1'),
        makeConnection('conn7', 'app3', 'db1'),
    ];
    return { nodes, connections };
}

function runScenario(
    name: string,
    topology: string,
    getTopology: () => { nodes: CanvasNode[]; connections: CanvasConnection[] },
    injectCount: number,
): BaselineScenarioResult {
    const { nodes, connections } = getTopology();
    const clientId = nodes.find((n) => n.type === 'client')!.id;

    const traces: RequestTrace[] = [];
    const runner = new SimulationRunner(
        nodes,
        connections,
        () => {}, // no-op tick callback
        { onTraceComplete: (t) => traces.push(t) },
    );

    runner.startForExternalLoop();

    for (let i = 0; i < injectCount; i++) {
        runner.injectSingleRequest(clientId);
        if (i < injectCount - 1) runner.stepFor(250);
    }

    runner.stepUntilTracedRequestCompletes();

    const baselineTraces: BaselineTraceResult[] = traces.map((t) => ({
        traceId: t.id,
        events: t.events.map((e) => ({
            nodeId: e.nodeId,
            nodeType: e.nodeType,
            action: e.action,
            timestamp: e.timestamp,
        })),
        completed: t.completed,
        eventCount: t.events.length,
    }));

    return { scenario: name, topology, traces: baselineTraces };
}

export function captureBaseline(): BaselineCaptureResult {
    const scenarios: BaselineScenarioResult[] = [
        runScenario('S1', 'Client->LB->App->DB', buildS1, 1),
        runScenario('S2', 'Client->LB->App->Cache->DB (read)', buildS2, 1),
        runScenario('S3', 'Client->LB->App->Cache->DB (read miss)', buildS3, 1),
        runScenario('S4', 'Client->LB->App->DB (write)', buildS4, 1),
        runScenario('S5', 'Client->LB->App->Cache->DB (write-through)', buildS5, 1),
        runScenario('S6', 'Client->LB->App->Cache->DB (write-behind)', buildS6, 1),
        runScenario('S7', 'Client->LB->App->Cache->DB (write-around)', buildS7, 1),
        runScenario('S8', 'Client->CDN->LB->App->DB (read)', buildS8, 1),
        runScenario('S9', 'Client->CDN->LB->App->DB (write)', buildS9, 1),
        runScenario('S10', 'Client->LB->3xApp->DB (seq 5)', buildS10, 5),
    ];

    return {
        capturedAt: new Date().toISOString(),
        modelVersion: 'dag',
        scenarios,
    };
}

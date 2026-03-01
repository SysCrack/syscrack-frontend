import { SimulationRunner } from './src/lib/simulation/SimulationRunner';
import { COMPONENT_CATALOG } from './src/lib/data/componentCatalog';

// TC-008 Topology
const nodes = [
    {
        id: 'c1', type: 'client', name: 'Client', x: 0, y: 0,
        sharedConfig: { ...COMPONENT_CATALOG[0].defaultSharedConfig },
        specificConfig: { requestsPerSecond: 100, readWriteRatio: 0.5 }
    },
    {
        id: 'app1', type: 'app_server', name: 'App Server', x: 200, y: 0,
        sharedConfig: { ...COMPONENT_CATALOG.find(c => c.type === 'app_server')!.defaultSharedConfig, scaling: { instances: 1 } },
        specificConfig: {}
    },
    {
        id: 'cache1', type: 'cache', name: 'Cache', x: 400, y: 0,
        sharedConfig: { ...COMPONENT_CATALOG.find(c => c.type === 'cache')!.defaultSharedConfig },
        specificConfig: { writeStrategy: 'write-behind', writeBehindDelayMs: 500, defaultTtl: 3600 }
    },
    {
        id: 'db1', type: 'database_sql', name: 'Database', x: 600, y: 0,
        sharedConfig: { ...COMPONENT_CATALOG.find(c => c.type === 'database_sql')!.defaultSharedConfig, scaling: { instances: 1 } },
        specificConfig: {}
    },
];
const connections = [
    { id: 'conn1', sourceId: 'c1', targetId: 'app1', protocol: 'http', bidirectional: false },
    { id: 'conn2', sourceId: 'app1', targetId: 'cache1', protocol: 'http', bidirectional: false },
    { id: 'conn3', sourceId: 'cache1', targetId: 'db1', protocol: 'http', bidirectional: false },
];

const runner = new SimulationRunner(nodes as any, connections as any, () => { });
runner.startForExternalLoop();

let lastDiag = "";
for (let i = 0; i < 120; i++) {
    runner.stepOnce(100);
    // @ts-ignore
    const metrics = runner.computeLiveMetrics();
    const staleCount = metrics.nodeMetrics['cache1']?.staleReadCount ?? 0;
    const diags = metrics.nodeMetrics['cache1']?.diagnostics ?? [];
    if (staleCount > 0) {
        console.log(`Tick ${i}: Stale reads! Count = ${staleCount}`);
    }
    if (diags.length > 0 && String(diags) !== lastDiag) {
        lastDiag = String(diags);
        console.log(`Tick ${i}: Diag = ${lastDiag}`);
    }
}
// @ts-ignore
const finalMetrics = runner.computeLiveMetrics();
console.log("Final Cache Misses: " + finalMetrics.nodeMetrics['cache1'].misses);
console.log("Final Cache Hits:   " + finalMetrics.nodeMetrics['cache1'].hits);
console.log("Stale reads:        " + finalMetrics.nodeMetrics['cache1'].staleReadCount);

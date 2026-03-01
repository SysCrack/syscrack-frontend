import { CanvasNode, CanvasConnection, CanvasComponentType } from '@/lib/types/canvas';

export type EdgeSemantics =
    | 'absorb-on-hit'         // Cache/CDN: consume hitRate% of reads, pass misses downstream
    | 'load-distribute'       // LB/API GW: split traffic across N backends (RPS shared)
    | 'fan-out'               // Pub/Sub: multiply traffic to N subscribers (RPS multiplied)
    | 'async-decouple'        // MQ/Queue: producer and consumer are decoupled; queue depth buffers
    | 'filter-block'          // WAF/Rate limiter: drop blockRate% of traffic before propagating
    | 'transparent-proxy'     // Proxy/Connection pool: in-path, no bypass, pools connections
    | 'in-path-auth'          // Auth Service: adds latency to every request, critical path
    | 'terminal-write'        // Object Store, TSDB, Data Lake, Analytics: one-way write sinks
    | 'derived-data-sync'     // CDC / WAL: async replication, eventual consistency, not request path
    | 'passthrough-compute'   // App Server, Worker, Serverless: processes and fans out downstream
    | 'consensus-gate'        // Consensus Node: blocks until quorum reached
    | 'dns-resolve';          // DNS: first-hop resolution, TTL-governed, no data flow

export interface ChaosPolicy {
    fallbackTargets: string[];
    rpsMultiplier: number;
    diagnostic: string;
}

export function classifyEdges(
    nodes: CanvasNode[],
    connections: CanvasConnection[]
): Map<string, EdgeSemantics> {
    const semanticsMap = new Map<string, EdgeSemantics>();
    const nodeMap = new Map<string, CanvasNode>(nodes.map(n => [n.id, n]));

    for (const conn of connections) {
        const source = nodeMap.get(conn.sourceId);
        const target = nodeMap.get(conn.targetId);

        if (!source || !target) {
            semanticsMap.set(conn.id, 'passthrough-compute');
            continue;
        }

        const sType = source.type;
        const tType = target.type;

        // Cache/CDN sitting between compute and storage
        if ((tType === 'cache' || tType === 'cdn') && hasDownstreamStorage(target, connections, nodeMap)) {
            semanticsMap.set(conn.id, 'absorb-on-hit');
            continue;
        }

        // LB or API GW distributing across multiple app servers
        if ((sType === 'load_balancer' || sType === 'api_gateway') && tType === 'app_server') {
            semanticsMap.set(conn.id, 'load-distribute');
            continue;
        }

        // Pub/Sub fan-out to multiple consumers
        if ((sType === 'pub_sub' || sType === 'stream') && countTargets(source, connections) > 1) {
            semanticsMap.set(conn.id, 'fan-out');
            continue;
        }

        // MQ decoupling producer from consumer
        if (tType === 'message_queue' || sType === 'message_queue') {
            semanticsMap.set(conn.id, 'async-decouple');
            continue;
        }

        // WAF in front of entry points
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((sType as any) === 'waf') {
            semanticsMap.set(conn.id, 'filter-block');
            continue;
        }

        // Proxy between compute and storage
        if (tType === 'proxy' || (tType as any) === 'connection_pool') {
            semanticsMap.set(conn.id, 'transparent-proxy');
            continue;
        }

        // Auth service in the critical path
        if (tType === 'auth_service') {
            semanticsMap.set(conn.id, 'in-path-auth');
            continue;
        }

        // Terminal storage sinks
        if (['object_store', 'timeseries_db', 'data_lake', 'analytics', 'notification'].includes(tType)) {
            semanticsMap.set(conn.id, 'terminal-write');
            continue;
        }

        // CDC / WAL derived data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (['cdc_connector', 'wal_log'].includes(sType as any) || ['cdc_connector', 'wal_log'].includes(tType as any)) {
            semanticsMap.set(conn.id, 'derived-data-sync');
            continue;
        }

        // Consensus coordination
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((tType as any) === 'consensus_node') {
            semanticsMap.set(conn.id, 'consensus-gate');
            continue;
        }

        // DNS first hop
        if (tType === 'dns') {
            semanticsMap.set(conn.id, 'dns-resolve');
            continue;
        }

        // Default: passthrough compute
        semanticsMap.set(conn.id, 'passthrough-compute');
    }

    return semanticsMap;
}

function hasDownstreamStorage(
    node: CanvasNode,
    connections: CanvasConnection[],
    nodeMap: Map<string, CanvasNode>
): boolean {
    const storageTypes = ['database_sql', 'database_nosql', 'object_store', 'timeseries_db', 'kv_store'];
    return connections.some(c =>
        c.sourceId === node.id &&
        storageTypes.includes(nodeMap.get(c.targetId)?.type ?? '')
    );
}

function countTargets(node: CanvasNode, connections: CanvasConnection[]): number {
    const uniqueTargets = new Set(connections.filter(c => c.sourceId === node.id).map(c => c.targetId));
    return uniqueTargets.size;
}

export function getChaosRoutingPolicy(
    failedNodeId: string,
    semantics: EdgeSemantics,
    adjacency: Map<string, string[]>
): ChaosPolicy {
    // Default policy: node is dead, traffic stops (100% error rate directly at the failed node)
    const policy: ChaosPolicy = {
        fallbackTargets: [],
        rpsMultiplier: 0,
        diagnostic: 'Node failed — no fallback available. Traffic dropped.',
    };

    switch (semantics) {
        case 'absorb-on-hit':
            // E.g., CDN or Cache failure -> bypass entirely to origin or DB.
            policy.fallbackTargets = adjacency.get(failedNodeId) ?? [];
            policy.rpsMultiplier = 1.0;
            policy.diagnostic = 'Cache/CDN failure — origin receiving full un-cached RPS.';
            break;

        case 'load-distribute':
            // LB failure is a SPOF unless another LB acts as fallback (typically not modelled this way here).
            // But if a backend app_server failed, LB handles it via health checks which SimulationRunner uses.
            // If the LB itself failed:
            policy.diagnostic = 'Load Balancer failure — single point of failure. Total outage for downstream.';
            break;

        case 'async-decouple':
            // MQ failure -> producers block or drop.
            policy.diagnostic = 'Message Queue failure — upstream producers blocked or dropping messages.';
            break;

        case 'consensus-gate':
            // Consensus node fails -> writes blocked.
            policy.diagnostic = 'Consensus node/leader failure — writes blocked until new election.';
            break;

        case 'derived-data-sync':
            // CDC fails -> writes to derived DBs stop.
            policy.diagnostic = 'CDC Connector offline — derived data stores falling behind.';
            break;

        case 'transparent-proxy':
            // Proxy failure -> no connection pooling, fallback to direct if available, else drop.
            policy.fallbackTargets = adjacency.get(failedNodeId) ?? [];
            policy.rpsMultiplier = 1.0;
            policy.diagnostic = 'Proxy failure — traffic bypassing pool or failing if no direct route.';
            break;

        case 'in-path-auth':
            policy.diagnostic = 'Auth Service failure — all authenticated requests failing.';
            break;

        case 'dns-resolve':
            policy.diagnostic = 'DNS failure — clients cannot resolve endpoints.';
            break;

        case 'passthrough-compute':
        case 'fan-out':
        case 'filter-block':
        case 'terminal-write':
        default:
            // Standard failure (like App Server).
            break;
    }

    return policy;
}

export function isMultiDBWrite(
    appServerNodeId: string,
    connections: CanvasConnection[],
    nodeMap: Map<string, CanvasNode>,
): boolean {
    const outConns = connections.filter(c => c.sourceId === appServerNodeId);
    const dbConns = outConns.filter(c => {
        const t = nodeMap.get(c.targetId)?.type;
        return t === 'database_sql' || t === 'database_nosql';
    });
    return dbConns.length >= 2;
}

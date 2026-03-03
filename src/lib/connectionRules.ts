/**
 * Connection Rules and Validation for System Design.
 *
 * Port of backend connection_rules.py. Defines valid downstream connections
 * between component types and validates at draw time.
 */
import type { CanvasComponentType, ConnectionProtocol } from '@/lib/types/canvas';
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';

// Valid downstream targets for each source type (frontend types)
const VALID_DOWNSTREAM: Partial<Record<CanvasComponentType, CanvasComponentType[]>> = {
    client: ['cdn', 'load_balancer', 'api_gateway', 'app_server'],
    cdn: ['load_balancer', 'app_server', 'object_store', 'cache'],
    load_balancer: ['app_server'],
    api_gateway: ['app_server'],
    app_server: ['cache', 'database_sql', 'database_nosql', 'message_queue', 'app_server', 'object_store', 'proxy'],
    cache: ['database_sql', 'database_nosql', 'cache', 'object_store', 'load_balancer', 'app_server'],
    database_sql: ['database_sql', 'database_nosql'],
    database_nosql: ['database_sql', 'database_nosql'],
    message_queue: ['app_server', 'worker'],
    pub_sub: ['worker'],
    worker: ['database_sql', 'database_nosql', 'object_store', 'message_queue'],
    proxy: ['database_sql', 'database_nosql', 'cache', 'object_store', 'message_queue'],
    object_store: [], // Terminal node
};

export interface ValidationResult {
    valid: boolean;
    message?: string;
    suggestion?: string;
}

/**
 * Validate a single connection between two component types.
 */
export function validateConnection(
    sourceType: CanvasComponentType,
    targetType: CanvasComponentType,
): ValidationResult {
    const validTargets = VALID_DOWNSTREAM[sourceType];

    if (validTargets === undefined) {
        // Unknown source type — allow (P2/P3 components may have rules added later)
        return { valid: true };
    }

    if (validTargets.length === 0) {
        return {
            valid: false,
            message: `${sourceType} cannot have outgoing connections`,
            suggestion: `Remove connection to ${targetType}`,
        };
    }

    if (validTargets.includes(targetType)) {
        return { valid: true };
    }

    return {
        valid: false,
        message: `${sourceType} should not connect directly to ${targetType}`,
        suggestion: `Valid targets: ${validTargets.join(', ')}`,
    };
}

/**
 * Return topology-level validation warnings (e.g. dangling proxy).
 * Call with nodes and connections to get warnings to display to the user.
 * Fires at connection draw time; each warning has a nodeId for badge placement.
 */
export type TopologyWarningSeverity = 'critical' | 'warning';

export interface TopologyWarning {
    nodeId?: string;
    message: string;
    severity: TopologyWarningSeverity;
}

export function getTopologyWarnings(
    nodes: CanvasNode[],
    connections: CanvasConnection[],
): TopologyWarning[] {
    const warnings: TopologyWarning[] = [];
    const nodeMap = new Map<string, CanvasNode>(nodes.map((n) => [n.id, n]));
    const outboundBySource = new Map<string, number>();
    const outboundTargets = new Map<string, Set<string>>();
    const inboundByTarget = new Map<string, number>();
    for (const c of connections) {
        outboundBySource.set(c.sourceId, (outboundBySource.get(c.sourceId) ?? 0) + 1);
        let set = outboundTargets.get(c.sourceId);
        if (!set) {
            set = new Set();
            outboundTargets.set(c.sourceId, set);
        }
        set.add(c.targetId);
        inboundByTarget.set(c.targetId, (inboundByTarget.get(c.targetId) ?? 0) + 1);
    }

    const getOutboundDbCount = (nodeId: string): number => {
        const set = outboundTargets.get(nodeId);
        if (!set) return 0;
        let n = 0;
        for (const tid of set) {
            const t = nodeMap.get(tid)?.type;
            if (t === 'database_sql' || t === 'database_nosql') n++;
        }
        return n;
    };

    const hasPathCdcToDb = (): { dbNodeId: string } | null => {
        const typeStr = (t: string) => t;
        const cdcOrWal = nodes.filter(
            (n) => typeStr(n.type as string) === 'cdc_connector' || typeStr(n.type as string) === 'wal_log',
        );
        const targetsBySource = new Map<string, string[]>();
        for (const c of connections) {
            const arr = targetsBySource.get(c.sourceId) ?? [];
            arr.push(c.targetId);
            targetsBySource.set(c.sourceId, arr);
        }
        const reachableFrom = (startId: string): Set<string> => {
            const seen = new Set<string>();
            const queue = [startId];
            seen.add(startId);
            while (queue.length > 0) {
                const id = queue.shift()!;
                for (const nextId of targetsBySource.get(id) ?? []) {
                    if (seen.has(nextId)) continue;
                    seen.add(nextId);
                    queue.push(nextId);
                }
            }
            return seen;
        };
        for (const start of cdcOrWal) {
            const fromCdc = reachableFrom(start.id);
            const mqIds = [...fromCdc].filter((id) => nodeMap.get(id)?.type === 'message_queue');
            for (const mqId of mqIds) {
                const fromMq = reachableFrom(mqId);
                const appIds = [...fromMq].filter((id) => nodeMap.get(id)?.type === 'app_server');
                for (const appId of appIds) {
                    const fromApp = reachableFrom(appId);
                    const dbId = [...fromApp].find((id) => {
                        const t = nodeMap.get(id)?.type;
                        return t === 'database_sql' || t === 'database_nosql';
                    });
                    if (dbId) return { dbNodeId: dbId };
                }
            }
        }
        return null;
    };

    // 1. App Server → 2+ DBs, distributedTransaction: none — CRITICAL
    for (const node of nodes) {
        if (node.type !== 'app_server') continue;
        if (getOutboundDbCount(node.id) < 2) continue;
        const sc = node.specificConfig as Record<string, unknown>;
        const dt = sc?.distributedTransaction;
        if (dt !== 'none' && dt != null) continue;
        warnings.push({
            nodeId: node.id,
            message:
                'Multi-DB writes without 2PC or Saga risk partial failure inconsistency.',
            severity: 'critical',
        });
    }

    // 2. MQ with single App Server consumer (instances 1) — WARNING
    for (const node of nodes) {
        if (node.type !== 'message_queue') continue;
        const targets = outboundTargets.get(node.id);
        if (!targets || targets.size === 0) continue;
        const appTargets = [...targets].filter((id) => nodeMap.get(id)?.type === 'app_server');
        if (appTargets.length !== 1) continue;
        const appNode = nodeMap.get(appTargets[0]);
        if (!appNode) continue;
        const instances = (appNode.sharedConfig as unknown as Record<string, unknown>)?.scaling as Record<string, unknown> | undefined;
        const inst = (instances?.instances as number) ?? 1;
        if (inst !== 1) continue;
        warnings.push({
            nodeId: node.id,
            message:
                'Single consumer = no parallelism and a SPOF. Add consumer replicas.',
            severity: 'warning',
        });
    }

    // 3. Any DB replication.mode multi-leader — WARNING
    for (const node of nodes) {
        if (node.type !== 'database_sql' && node.type !== 'database_nosql') continue;
        const sc = node.specificConfig as Record<string, unknown>;
        const repl = (sc?.replication ?? {}) as Record<string, unknown>;
        if ((repl?.mode as string) !== 'multi-leader') continue;
        warnings.push({
            nodeId: node.id,
            message:
                'Multi-leader enables geo-distributed writes but introduces write conflicts requiring a resolution strategy.',
            severity: 'warning',
        });
    }

    // 4. Leaderless DB + quorum.r === 1 — WARNING
    for (const node of nodes) {
        if (node.type !== 'database_nosql') continue;
        const sc = node.specificConfig as Record<string, unknown>;
        const repl = (sc?.replication ?? {}) as Record<string, unknown>;
        if ((repl?.mode as string) !== 'leaderless') continue;
        const quorum = (sc?.quorum ?? {}) as Record<string, unknown>;
        const r = (quorum?.r as number) ?? 2;
        if (r !== 1) continue;
        warnings.push({
            nodeId: node.id,
            message:
                'r=1 contacts only one replica — stale reads likely with async replication.',
            severity: 'warning',
        });
    }

    // 5. Cache write-around + read-heavy client (readWriteRatio > 0.7) — WARNING
    const hasReadHeavyClient = nodes.some((n) => {
        if (n.type !== 'client') return false;
        const sc = n.specificConfig as Record<string, unknown>;
        const r = (sc?.readWriteRatio as number) ?? 0.8;
        return r > 0.7;
    });
    if (hasReadHeavyClient) {
        for (const node of nodes) {
            if (node.type !== 'cache') continue;
            const sc = node.specificConfig as Record<string, unknown>;
            if ((sc?.writeStrategy as string) !== 'write-around') continue;
            warnings.push({
                nodeId: node.id,
                message:
                    "Write-around won't cache new writes — cache hit rate will degrade for recently written keys.",
                severity: 'warning',
            });
        }
    }

    // 6. LB/API GW → App Server + DB isolation serializable — WARNING
    const hasSerializableDb = nodes.some((n) => {
        if (n.type !== 'database_sql') return false;
        const sc = n.specificConfig as Record<string, unknown>;
        return (sc?.isolation as string) === 'serializable';
    });
    if (hasSerializableDb) {
        const lbOrGwIds = new Set(
            nodes.filter((n) => n.type === 'load_balancer' || n.type === 'api_gateway').map((n) => n.id),
        );
        for (const node of nodes) {
            if (node.type !== 'app_server') continue;
            const isTargetOfLb = connections.some(
                (c) => c.targetId === node.id && lbOrGwIds.has(c.sourceId),
            );
            if (!isTargetOfLb) continue;
            const dbTargets = [...(outboundTargets.get(node.id) ?? [])].filter(
                (id) => nodeMap.get(id)?.type === 'database_sql' || nodeMap.get(id)?.type === 'database_nosql',
            );
            const anySerializable = dbTargets.some((id) => {
                const db = nodeMap.get(id);
                return db?.type === 'database_sql' && (db.specificConfig as Record<string, unknown>)?.isolation === 'serializable';
            });
            if (!anySerializable) continue;
            warnings.push({
                nodeId: node.id,
                message:
                    'Serializable isolation with horizontal scaling requires cross-instance coordination — throughput won\'t scale linearly.',
                severity: 'warning',
            });
        }
    }

    // 7. CDC → MQ → App Server → DB — WARNING
    const cdcPath = hasPathCdcToDb();
    if (cdcPath) {
        warnings.push({
            nodeId: cdcPath.dbNodeId,
            message:
                "You've built an event-driven derived data pipeline. The target DB has eventual consistency with the source.",
            severity: 'warning',
        });
    }

    // 8. Auth Service replicas 1 in request path — CRITICAL
    for (const node of nodes) {
        if ((node.type as string) !== 'auth_service') continue;
        const instances = (node.sharedConfig as unknown as Record<string, unknown>)?.scaling as Record<string, unknown> | undefined;
        const inst = (instances?.instances as number) ?? 1;
        if (inst !== 1) continue;
        const hasConn = (outboundBySource.get(node.id) ?? 0) > 0 || (inboundByTarget.get(node.id) ?? 0) > 0;
        if (!hasConn) continue;
        warnings.push({
            nodeId: node.id,
            message: 'Single-instance Auth Service — SPOF in request path',
            severity: 'critical',
        });
    }

    // 9. Proxy with no downstream — CRITICAL
    for (const node of nodes) {
        if (node.type === 'proxy' && (outboundBySource.get(node.id) ?? 0) === 0) {
            warnings.push({
                nodeId: node.id,
                message: 'Dangling proxy — no storage connected',
                severity: 'critical',
            });
        }
    }

    // 10. Cache write-behind + any DB isolation serializable — WARNING
    if (hasSerializableDb) {
        for (const node of nodes) {
            if (node.type !== 'cache') continue;
            const sc = node.specificConfig as Record<string, unknown>;
            if ((sc?.writeStrategy as string) !== 'write-behind') continue;
            warnings.push({
                nodeId: node.id,
                message: 'Write-behind + serializable isolation is contradictory',
                severity: 'warning',
            });
        }
    }

    return warnings;
}

// ── Protocol Factors (simulation impact) ─────────────────────────────────────

export const PROTOCOL_FACTORS: Record<
    ConnectionProtocol,
    { overheadMs: number; packetLossRate: number; capacityMultiplier: number; connectionCostFactor: number }
> = {
    http: { overheadMs: 8, packetLossRate: 0, capacityMultiplier: 1.0, connectionCostFactor: 1.0 },
    grpc: { overheadMs: 2, packetLossRate: 0, capacityMultiplier: 1.4, connectionCostFactor: 1.1 },
    websocket: { overheadMs: 1, packetLossRate: 0, capacityMultiplier: 1.2, connectionCostFactor: 1.5 },
    tcp: { overheadMs: 1, packetLossRate: 0, capacityMultiplier: 1.3, connectionCostFactor: 1.2 },
    udp: { overheadMs: 0, packetLossRate: 0.02, capacityMultiplier: 1.5, connectionCostFactor: 0.5 },
    custom: { overheadMs: 5, packetLossRate: 0, capacityMultiplier: 1.0, connectionCostFactor: 1.0 },
};

/**
 * Return a soft warning message for non-feasible protocol + connection combos, or null.
 */
export function getProtocolWarning(
    sourceType: CanvasComponentType,
    targetType: CanvasComponentType,
    protocol: ConnectionProtocol,
): string | null {
    const target = targetType as string;
    if (['database_sql', 'database_nosql', 'cache'].includes(target) && protocol !== 'tcp') {
        return 'Databases and caches typically use TCP. Consider switching to TCP for realistic modeling.';
    }
    if (['cdn', 'object_store'].includes(target) && protocol !== 'http') {
        return 'CDNs and object stores typically serve over HTTP. Consider switching to HTTP.';
    }
    if (target === 'message_queue' && protocol === 'udp') {
        return 'Message queues require reliable delivery. UDP is unreliable — consider TCP.';
    }
    if (target === 'proxy' && protocol === 'udp') {
        return 'Proxies typically use TCP or HTTP.';
    }
    return null;
}

/**
 * Return the default protocol for a connection from source to target.
 */
export function getDefaultProtocol(
    sourceType: CanvasComponentType,
    targetType: CanvasComponentType,
): ConnectionProtocol {
    const target = targetType as string;
    const source = sourceType as string;
    if (['database_sql', 'database_nosql', 'cache', 'message_queue'].includes(target)) return 'tcp';
    if (['cdn', 'object_store'].includes(target)) return 'http';
    if (target === 'proxy') return 'tcp';
    if (source === 'proxy') {
        if (['database_sql', 'database_nosql', 'cache', 'message_queue'].includes(target)) return 'tcp';
        if (['cdn', 'object_store'].includes(target)) return 'http';
    }
    if (source === 'app_server' && target === 'app_server') return 'grpc';
    return 'http';
}

/**
 * Connection Rules and Validation for System Design.
 *
 * Port of backend connection_rules.py. Defines valid downstream connections
 * between component types and validates at draw time.
 */
import type { CanvasComponentType, ConnectionProtocol } from '@/lib/types/canvas';

// Valid downstream targets for each source type (frontend types)
const VALID_DOWNSTREAM: Partial<Record<CanvasComponentType, CanvasComponentType[]>> = {
    client: ['cdn', 'load_balancer', 'api_gateway', 'app_server'],
    cdn: ['load_balancer', 'app_server', 'object_store'],
    load_balancer: ['app_server'],
    api_gateway: ['app_server'],
    app_server: ['cache', 'database_sql', 'database_nosql', 'message_queue', 'app_server', 'object_store'],
    cache: ['database_sql', 'database_nosql', 'cache'],
    database_sql: ['database_sql', 'database_nosql'],
    database_nosql: ['database_sql', 'database_nosql'],
    message_queue: ['app_server'],
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

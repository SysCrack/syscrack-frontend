/**
 * Canvas type system for the react-konva rebuild.
 * 
 * Defines component nodes, connections, configs, and the
 * component catalog with category/priority metadata.
 */
import { v4 as uuidv4 } from 'uuid';

// ============ Component Categories & Types ============

export type ComponentCategory =
    | 'traffic'
    | 'compute'
    | 'storage'
    | 'messaging'
    | 'ai'
    | 'techniques';

export type CanvasComponentType =
    // Traffic & Edge
    | 'cdn'
    | 'load_balancer'
    | 'api_gateway'
    | 'dns'
    // Compute
    | 'app_server'
    | 'worker'
    | 'serverless'
    | 'auth_service'
    // Storage
    | 'cache'
    | 'database_sql'
    | 'database_nosql'
    | 'object_store'
    | 'kv_store'
    | 'timeseries_db'
    // Messaging
    | 'message_queue'
    | 'pub_sub'
    | 'stream'
    // AI
    | 'llm_gateway'
    | 'agent_orchestrator'
    // Techniques
    | 'shard'
    | 'replica'
    | 'partition'
    // Meta
    | 'client';

export type PriorityTier = 'p1' | 'p2' | 'p3';

// ============ Shared Config Layers ============

export interface DeploymentConfig {
    region: 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'ap-southeast-1';
}

export interface DisplayConfig {
    mode: 'collapsed' | 'expanded' | 'detailed';
}

export interface ScalingConfig {
    replicas: number;
    nodeCapacityRps: number;
    enableSharding?: boolean;
    shardCount?: number;
}

export interface ConsistencyConfig {
    replicationStrategy: 'leader-follower' | 'multi-leader' | 'leaderless';
    replicationFactor: number;
}

export interface ResilienceConfig {
    circuitBreaker: boolean;
    automaticRetries: boolean;
    retryBackoff?: 'fixed' | 'exponential';
}

export interface TrafficControlConfig {
    rateLimiting: boolean;
    rateLimit?: number;
    rateLimitStrategy?: 'token-bucket' | 'sliding-window' | 'fixed-window';
}

export interface SharedConfig {
    deployment: DeploymentConfig;
    display: DisplayConfig;
    scaling?: ScalingConfig;
    consistency?: ConsistencyConfig;
    resilience?: ResilienceConfig;
    trafficControl?: TrafficControlConfig;
}

// ============ Component-Specific Configs ============

export interface CDNSpecificConfig {
    cacheTtl: number;
    originShield: boolean;
    edgeLocations: number;
}

export interface LoadBalancerSpecificConfig {
    algorithm: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted';
    healthCheckInterval: number;
    stickySessions: boolean;
}

export interface APIGatewaySpecificConfig {
    authEnabled: boolean;
    cors: boolean;
    requestTransformation: boolean;
}

export interface AppServerSpecificConfig {
    instanceType: 'small' | 'medium' | 'large' | 'xlarge';
    autoScaling: boolean;
    minInstances?: number;
    maxInstances?: number;
}

export interface CacheSpecificConfig {
    engine: 'redis' | 'memcached';
    maxMemory: '256MB' | '1GB' | '4GB' | '16GB';
    clusterMode: boolean;
    readStrategy: 'cache-aside' | 'read-through';
    writeStrategy: 'write-through' | 'write-behind' | 'write-around';
    evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'ttl-based' | 'random';
    defaultTtl: number;
}

export interface DatabaseSQLSpecificConfig {
    engine: 'postgresql' | 'mysql' | 'aurora';
    instanceType: 'small' | 'medium' | 'large' | 'xlarge';
    readReplicas: number;
    connectionPooling: boolean;
}

export interface DatabaseNoSQLSpecificConfig {
    engine: 'dynamodb' | 'mongodb' | 'cassandra';
    consistencyLevel: 'eventual' | 'strong';
}

export interface ObjectStoreSpecificConfig {
    storageClass: 'standard' | 'infrequent-access' | 'glacier';
    versioning: boolean;
    lifecycleRules: boolean;
}

export interface MessageQueueSpecificConfig {
    type: 'standard' | 'fifo';
    visibilityTimeout: number;
    deadLetterQueue: boolean;
    maxRetries: number;
    retentionPeriod: number;
}

export type ComponentSpecificConfig =
    | CDNSpecificConfig
    | LoadBalancerSpecificConfig
    | APIGatewaySpecificConfig
    | AppServerSpecificConfig
    | CacheSpecificConfig
    | DatabaseSQLSpecificConfig
    | DatabaseNoSQLSpecificConfig
    | ObjectStoreSpecificConfig
    | MessageQueueSpecificConfig
    | Record<string, unknown>;

// ============ Canvas Node ============

export interface CanvasNode {
    id: string;
    type: CanvasComponentType;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    sharedConfig: SharedConfig;
    specificConfig: ComponentSpecificConfig;
}

// ============ Canvas Connection ============

export type ConnectionProtocol = 'http' | 'grpc' | 'websocket' | 'tcp' | 'udp' | 'custom';

export interface CanvasConnection {
    id: string;
    sourceId: string;
    targetId: string;
    protocol: ConnectionProtocol;
    bidirectional: boolean;
    label?: string;
}

// ============ Port (connection anchor points) ============

export interface Port {
    id: string;
    nodeId: string;
    side: 'top' | 'right' | 'bottom' | 'left';
    index: number;
}

// ============ Viewport ============

export interface Viewport {
    x: number;
    y: number;
    scale: number;
}

// ============ Component Catalog Entry ============

export interface ComponentCatalogEntry {
    type: CanvasComponentType;
    label: string;
    icon: string; // emoji for now, can be replaced with SVG later
    category: ComponentCategory;
    priority: PriorityTier;
    description: string;
    defaultSharedConfig: SharedConfig;
    defaultSpecificConfig: ComponentSpecificConfig;
    /** Which shared config layers are applicable */
    applicableLayers: {
        scaling: boolean;
        consistency: boolean;
        resilience: boolean;
        trafficControl: boolean;
        /** If scaling is applicable, does it support sharding? */
        sharding: boolean;
    };
}

// ============ Defaults & Factory ============

export const DEFAULT_SHARED_CONFIG: SharedConfig = {
    deployment: { region: 'us-east-1' },
    display: { mode: 'expanded' },
};

export const DEFAULT_NODE_SIZE = { width: 160, height: 80 };

export function createNode(
    type: CanvasComponentType,
    x: number,
    y: number,
    catalog: ComponentCatalogEntry,
): CanvasNode {
    return {
        id: uuidv4(),
        type,
        name: catalog.label,
        x,
        y,
        width: DEFAULT_NODE_SIZE.width,
        height: DEFAULT_NODE_SIZE.height,
        sharedConfig: { ...catalog.defaultSharedConfig },
        specificConfig: { ...catalog.defaultSpecificConfig },
    };
}

export function createConnection(
    sourceId: string,
    targetId: string,
    protocol: ConnectionProtocol = 'http',
): CanvasConnection {
    return {
        id: uuidv4(),
        sourceId,
        targetId,
        protocol,
        bidirectional: false,
    };
}

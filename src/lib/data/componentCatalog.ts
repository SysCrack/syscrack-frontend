/**
 * P1 Component Catalog — the 10 MVP components users can drag onto the canvas.
 * 
 * Each entry defines the component's metadata, default configs, and which
 * shared config layers apply. P2/P3 components are added in later phases.
 */
import type {
    ComponentCatalogEntry,
    SharedConfig,
} from '@/lib/types/canvas';

// ============ Defaults ============

const BASE_SHARED: SharedConfig = {
    deployment: { region: 'us-east-1' },
    display: { mode: 'expanded' },
};

function withScaling(instances = 1, rps = 1000): SharedConfig {
    return { ...BASE_SHARED, scaling: { instances, nodeCapacityRps: rps } };
}

function withScalingAndConsistency(instances = 1, rps = 1000): SharedConfig {
    return {
        ...BASE_SHARED,
        scaling: { instances, nodeCapacityRps: rps, enableSharding: false },
        consistency: { replicationStrategy: 'leader-follower', replicationFactor: 1 },
    };
}

// ============ P1 Catalog ============

export const COMPONENT_CATALOG: ComponentCatalogEntry[] = [
    // ── Traffic & Edge ────────────────────────────
    {
        type: 'client',
        label: 'Client',
        icon: '👤',
        category: 'traffic',
        priority: 'p1',
        description: 'End user or external system sending requests',
        defaultSharedConfig: BASE_SHARED,
        defaultSpecificConfig: { requestsPerSecond: 1000, readWriteRatio: 0.8 },
        applicableLayers: { scaling: false, consistency: false, resilience: false, trafficControl: false, sharding: false },
    },
    {
        type: 'cdn',
        label: 'CDN',
        icon: '🌐',
        category: 'traffic',
        priority: 'p1',
        description: 'Content Delivery Network — cache static/dynamic content at edge',
        defaultSharedConfig: BASE_SHARED,
        defaultSpecificConfig: { cacheTtl: 3600, originShield: false, edgeLocations: 10 },
        applicableLayers: { scaling: false, consistency: false, resilience: false, trafficControl: true, sharding: false },
    },
    {
        type: 'load_balancer',
        label: 'Load Balancer',
        icon: '⚖️',
        category: 'traffic',
        priority: 'p1',
        description: 'Distributes traffic across backend instances',
        defaultSharedConfig: { ...withScaling(1, 5000), resilience: { circuitBreaker: false, automaticRetries: false }, trafficControl: { rateLimiting: false } },
        defaultSpecificConfig: { algorithm: 'round-robin', healthCheckInterval: 30, stickySessions: false },
        applicableLayers: { scaling: true, consistency: false, resilience: true, trafficControl: true, sharding: false },
    },
    {
        type: 'api_gateway',
        label: 'API Gateway',
        icon: '🚪',
        category: 'traffic',
        priority: 'p1',
        description: 'Entry point for API requests — auth, rate limiting, routing',
        defaultSharedConfig: { ...withScaling(2, 3000), resilience: { circuitBreaker: true, automaticRetries: true }, trafficControl: { rateLimiting: true, rateLimit: 1000, rateLimitStrategy: 'token-bucket' } },
        defaultSpecificConfig: { authEnabled: true, cors: true, requestTransformation: false },
        applicableLayers: { scaling: true, consistency: false, resilience: true, trafficControl: true, sharding: false },
    },

    // ── Compute ───────────────────────────────────
    {
        type: 'app_server',
        label: 'App Server',
        icon: '🖥️',
        category: 'compute',
        priority: 'p1',
        description: 'Application server handling business logic',
        defaultSharedConfig: { ...withScaling(1, 500), resilience: { circuitBreaker: false, automaticRetries: false } },
        defaultSpecificConfig: { instanceType: 'medium', autoScaling: true, minInstances: 1, maxInstances: 10 },
        applicableLayers: { scaling: true, consistency: false, resilience: true, trafficControl: false, sharding: false },
    },
    {
        type: 'proxy',
        label: 'Proxy',
        icon: '🔀',
        category: 'compute',
        priority: 'p1',
        description: 'Data-layer proxy — connection pooling, routing, failover for backends',
        defaultSharedConfig: { ...withScaling(1, 8000), resilience: { circuitBreaker: false, automaticRetries: false } },
        defaultSpecificConfig: {
            algorithm: 'round-robin',
            connectionPooling: true,
            maxConnections: 500,
            healthCheckInterval: 10,
        },
        applicableLayers: { scaling: true, consistency: false, resilience: true, trafficControl: false, sharding: false },
    },

    // ── Storage ───────────────────────────────────
    {
        type: 'cache',
        label: 'Cache',
        icon: '⚡',
        category: 'storage',
        priority: 'p1',
        description: 'In-memory cache for fast reads — Redis or Memcached',
        defaultSharedConfig: withScalingAndConsistency(1, 10000),
        defaultSpecificConfig: {
            engine: 'redis',
            maxMemory: '1GB',
            clusterMode: false,
            readStrategy: 'cache-aside',
            writeStrategy: 'write-around',
            evictionPolicy: 'lru',
            defaultTtl: 3600,
            maxEntries: 24,
        },
        applicableLayers: { scaling: true, consistency: true, resilience: false, trafficControl: false, sharding: true },
    },
    {
        type: 'database_sql',
        label: 'Database (SQL)',
        icon: '🗄️',
        category: 'storage',
        priority: 'p1',
        description: 'Relational database — PostgreSQL, MySQL, Aurora',
        defaultSharedConfig: withScalingAndConsistency(1, 500),
        defaultSpecificConfig: { engine: 'postgresql', instanceType: 'medium', readReplicas: 0, connectionPooling: true },
        applicableLayers: { scaling: true, consistency: true, resilience: false, trafficControl: false, sharding: true },
    },
    {
        type: 'database_nosql',
        label: 'Database (NoSQL)',
        icon: '📦',
        category: 'storage',
        priority: 'p1',
        description: 'Non-relational database — DynamoDB, MongoDB, Cassandra',
        defaultSharedConfig: withScalingAndConsistency(1, 2000),
        defaultSpecificConfig: { engine: 'dynamodb', consistencyLevel: 'eventual' },
        applicableLayers: { scaling: true, consistency: true, resilience: false, trafficControl: false, sharding: true },
    },
    {
        type: 'object_store',
        label: 'Object Store',
        icon: '☁️',
        category: 'storage',
        priority: 'p1',
        description: 'Blob storage for files — S3, GCS, Azure Blob',
        defaultSharedConfig: {
            ...BASE_SHARED,
            consistency: { replicationStrategy: 'leader-follower', replicationFactor: 3 },
        },
        defaultSpecificConfig: { storageClass: 'standard', versioning: false, lifecycleRules: false },
        applicableLayers: { scaling: false, consistency: true, resilience: false, trafficControl: false, sharding: false },
    },

    // ── Messaging ─────────────────────────────────
    {
        type: 'message_queue',
        label: 'Message Queue',
        icon: '📬',
        category: 'messaging',
        priority: 'p1',
        description: 'Async message processing — SQS, RabbitMQ',
        defaultSharedConfig: {
            ...BASE_SHARED,
            scaling: { instances: 1, nodeCapacityRps: 5000 },
            consistency: { replicationStrategy: 'leader-follower', replicationFactor: 1 },
            trafficControl: { rateLimiting: false },
        },
        defaultSpecificConfig: { type: 'standard', visibilityTimeout: 30, deadLetterQueue: true, maxRetries: 3, retentionPeriod: 168 },
        applicableLayers: { scaling: true, consistency: true, resilience: false, trafficControl: true, sharding: false },
    },

    // ── Chaos ─────────────────────────────────────
    {
        type: 'chaos_failure',
        label: 'Node Failure',
        icon: '💥',
        category: 'chaos',
        priority: 'p1',
        description: 'Instantly drop all incoming connections to this node',
        defaultSharedConfig: BASE_SHARED,
        defaultSpecificConfig: {},
        applicableLayers: { scaling: false, consistency: false, resilience: false, trafficControl: false, sharding: false },
    },
    {
        type: 'chaos_latency',
        label: 'Latency Injection',
        icon: '⏱️',
        category: 'chaos',
        priority: 'p1',
        description: 'Add artificial latency to requests processing at this node',
        defaultSharedConfig: BASE_SHARED,
        defaultSpecificConfig: {},
        applicableLayers: { scaling: false, consistency: false, resilience: false, trafficControl: false, sharding: false },
    },
    {
        type: 'chaos_spike',
        label: 'Load Spike',
        icon: '📈',
        category: 'chaos',
        priority: 'p1',
        description: 'Multiply request rate by 5x (Clients only)',
        defaultSharedConfig: BASE_SHARED,
        defaultSpecificConfig: {},
        applicableLayers: { scaling: false, consistency: false, resilience: false, trafficControl: false, sharding: false },
    },
    {
        type: 'chaos_partition',
        label: 'Network Partition',
        icon: '✂️',
        category: 'chaos',
        priority: 'p1',
        description: 'Sever network connectivity to/from this node',
        defaultSharedConfig: BASE_SHARED,
        defaultSpecificConfig: {},
        applicableLayers: { scaling: false, consistency: false, resilience: false, trafficControl: false, sharding: false },
    },
];

// ============ Lookup Helpers ============

export function getCatalogEntry(type: string): ComponentCatalogEntry | undefined {
    return COMPONENT_CATALOG.find((c) => c.type === type);
}

export function getCatalogByCategory(category: string): ComponentCatalogEntry[] {
    return COMPONENT_CATALOG.filter((c) => c.category === category);
}

export const CATEGORIES = [
    { id: 'traffic', label: 'Traffic & Edge', icon: '🌐' },
    { id: 'compute', label: 'Compute', icon: '🖥️' },
    { id: 'storage', label: 'Storage', icon: '🗄️' },
    { id: 'messaging', label: 'Messaging', icon: '📬' },
    { id: 'ai', label: 'AI & Agents', icon: '🤖' },
    { id: 'techniques', label: 'Techniques', icon: '🔧' },
    { id: 'chaos', label: 'Chaos', icon: '🔥' },
] as const;

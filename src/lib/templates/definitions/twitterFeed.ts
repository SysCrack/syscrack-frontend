import type { ScenarioTemplate } from '../types';
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import { TEMPLATE_SCHEMA_VERSION } from '../types';

const nodes: CanvasNode[] = [
    {
        id: 'tw-client',
        type: 'client',
        name: 'Client',
        x: 100, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
        },
        specificConfig: { requestsPerSecond: 300, readWriteRatio: 0.8 }, // readWriteRatio ignored when workloadProfile is active
    },
    {
        id: 'tw-lb',
        type: 'load_balancer',
        name: 'Load Balancer',
        x: 300, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 1, nodeCapacityRps: 5000 },
            resilience: { circuitBreaker: false, automaticRetries: false },
            trafficControl: { rateLimiting: false },
        },
        specificConfig: { algorithm: 'round-robin', healthCheckInterval: 30, stickySessions: false },
    },
    {
        id: 'tw-app',
        type: 'app_server',
        name: 'App Server',
        x: 500, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 3, nodeCapacityRps: 300 },
            resilience: { circuitBreaker: false, automaticRetries: false },
        },
        specificConfig: { instanceType: 'medium', autoScaling: true, minInstances: 1, maxInstances: 10, distributedTransaction: 'none', sagaCompensation: 'choreography' },
    },
    {
        id: 'tw-cache',
        type: 'cache',
        name: 'Feed Cache',
        x: 700, y: 90,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 1, nodeCapacityRps: 10000 },
            consistency: { replicationStrategy: 'leader-follower', replicationFactor: 1 },
        },
        specificConfig: {
            engine: 'redis',
            maxMemory: '4GB',
            clusterMode: false,
            readStrategy: 'cache-aside',
            writeStrategy: 'write-around',
            evictionPolicy: 'lru',
            defaultTtl: 60,
            maxEntries: 50000,
        },
    },
    {
        id: 'tw-mq',
        type: 'message_queue',
        name: 'Fan-Out Queue',
        x: 700, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 1, nodeCapacityRps: 5000 },
            consistency: { replicationStrategy: 'leader-follower', replicationFactor: 1 },
            trafficControl: { rateLimiting: false },
        },
        specificConfig: {
            type: 'standard',
            visibilityTimeout: 30,
            deadLetterQueue: true,
            maxRetries: 3,
            retentionPeriod: 168,
            deliveryGuarantee: 'at-least-once',
            consumerGroupCount: 1,
            backpressure: 'block',
        },
    },
    {
        id: 'tw-worker',
        type: 'worker',
        name: 'Fan-Out Worker',
        x: 900, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 4, nodeCapacityRps: 400 },
            resilience: { circuitBreaker: false, automaticRetries: false },
        },
        specificConfig: {
            instanceType: 'medium',
            processingTimeMs: 20,
            jobType: 'io-bound',
            autoScaling: false,
            minInstances: 1,
            maxInstances: 10,
            maxRetries: 3,
        },
    },
    {
        id: 'tw-db',
        type: 'database_nosql',
        name: 'Tweets DB',
        x: 900, y: 410,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 1, nodeCapacityRps: 2000 },
            consistency: { replicationStrategy: 'leaderless', replicationFactor: 3 },
        },
        specificConfig: {
            engine: 'cassandra',
            consistencyLevel: 'eventual',
            replication: {
                mode: 'leaderless',
                syncMode: 'asynchronous',
                replicationLagMs: 100,
                lagVarianceMs: 20,
                catchUpOnFailover: false,
            },
            quorum: { n: 3, w: 2, r: 2 },
            storageEngine: { type: 'lsm-tree', bloomFilters: true, compactionStrategy: 'leveled' },
            sharding: { enabled: false, strategy: 'hash-based', shardKey: 'id', shardCount: 4, consistentHashing: true, hotspotFactor: 0.0 },
        },
    },
];

const connections: CanvasConnection[] = [
    { id: 'tw-c-lb', sourceId: 'tw-client', targetId: 'tw-lb', protocol: 'http', bidirectional: false },
    { id: 'tw-lb-app', sourceId: 'tw-lb', targetId: 'tw-app', protocol: 'http', bidirectional: false },
    { id: 'tw-app-cache', sourceId: 'tw-app', targetId: 'tw-cache', protocol: 'http', bidirectional: false },
    { id: 'tw-app-mq', sourceId: 'tw-app', targetId: 'tw-mq', protocol: 'http', bidirectional: false },
    { id: 'tw-mq-worker', sourceId: 'tw-mq', targetId: 'tw-worker', protocol: 'http', bidirectional: false },
    { id: 'tw-worker-db', sourceId: 'tw-worker', targetId: 'tw-db', protocol: 'http', bidirectional: false },
    { id: 'tw-app-db', sourceId: 'tw-app', targetId: 'tw-db', protocol: 'http', bidirectional: false },
];

export const twitterFeedTemplate: ScenarioTemplate = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: 'twitter-feed',
    name: 'Twitter Feed',
    difficulty: 'intermediate',
    category: 'classic',
    description: 'Fan-out-on-write architecture where tweets are asynchronously distributed to follower feed caches via message queue workers.',
    designRationale:
        'Fan-out-on-write: when a user tweets, a Worker fans out to followers\' ' +
        'feed caches asynchronously — the App Server returns immediately after ' +
        'enqueuing. Feed reads are served from cache. NoSQL with leaderless ' +
        'replication handles high write availability. Remove the MQ to make ' +
        'fan-out synchronous and watch request latency spike.',
    tags: ['fan-out', 'async', 'nosql', 'caching'],
    nodes,
    connections,
    scoringRubric: [
        {
            id: 'twitter-mq',
            description: 'MQ for async fan-out',
            checkType: 'topology',
            weight: 'required',
            params: { nodeType: 'message_queue' },
        },
        {
            id: 'twitter-worker',
            description: 'Worker downstream of MQ',
            checkType: 'topology',
            weight: 'required',
            params: { sourceType: 'message_queue', targetType: 'worker' },
        },
        {
            id: 'twitter-nosql',
            description: 'NoSQL DB used',
            checkType: 'topology',
            weight: 'required',
            params: { nodeType: 'database_nosql' },
        },
        {
            id: 'twitter-cache',
            description: 'Cache for feed reads',
            checkType: 'topology',
            weight: 'bonus',
            params: { nodeType: 'cache' },
        },
        {
            id: 'twitter-worker-replicas',
            description: 'Worker has 2+ instances',
            checkType: 'config',
            weight: 'bonus',
            params: { nodeType: 'worker', field: 'instances', min: 2 },
        },
    ],
    workloadRef: 'twitter-feed-v1',
    workloadProfile: {
        readLabel: 'Feed reads',
        writeLabel: 'Tweets',
        archetypes: [
            {
                id: 'feed-read',
                label: 'Feed read',
                method: 'read',
                weight: 0.55,
                cacheKeyPattern: 'feed:user_{id}',
                sampleIds: [
                    'user_001', 'user_048', 'user_119', 'user_204', 'user_317',
                    'user_482', 'user_531', 'user_607', 'user_744', 'user_812',
                    'user_903', 'user_056', 'user_178', 'user_293', 'user_415',
                    'user_524', 'user_668', 'user_731', 'user_849', 'user_962',
                ],
                sampleData: [
                    { id: 'user_001', preview: '@alice: just shipped leaderless replication support \uD83D\uDE80' },
                    { id: 'user_048', preview: '@bob: anyone else seeing weird latency spikes today?' },
                    { id: 'user_119', preview: '@carol: hot take: eventual consistency is fine for 90% of apps' },
                    { id: 'user_204', preview: '@dave: cassandra r=1 and you wonder why you get stale reads' },
                    { id: 'user_317', preview: '@eve: fan-out-on-write is simpler than fan-out-on-read' },
                ],
            },
            {
                id: 'view-profile',
                label: 'View profile',
                method: 'read',
                weight: 0.15,
                cacheKeyPattern: 'profile:user_{id}',
                sampleIds: [
                    'user_001', 'user_048', 'user_119', 'user_204', 'user_317',
                    'user_482', 'user_531', 'user_607', 'user_744', 'user_812',
                ],
                sampleData: [
                    { id: 'user_001', preview: 'Alice Chen · 2.1K followers · SRE @bigco' },
                    { id: 'user_048', preview: 'Bob Martinez · 847 followers · Backend eng' },
                    { id: 'user_119', preview: 'Carol Wu · 15K followers · Distributed systems blogger' },
                ],
                dbLabel: 'SELECT * FROM users WHERE id = ?',
            },
            {
                id: 'view-tweet',
                label: 'View tweet',
                method: 'read',
                weight: 0.10,
                cacheKeyPattern: 'tweet:{id}',
                sampleIds: [
                    't_28401', 't_39122', 't_44810', 't_51273', 't_60395',
                    't_71847', 't_83029', 't_91456', 't_10583', 't_22764',
                ],
                dbLabel: 'SELECT * FROM tweets WHERE id = ?',
            },
            {
                id: 'post-tweet',
                label: 'Post tweet',
                method: 'write',
                weight: 0.15,
                sampleIds: [
                    't_28401', 't_39122', 't_44810', 't_51273', 't_60395',
                    't_71847', 't_83029', 't_91456', 't_10583', 't_22764',
                ],
                dbLabel: 'INSERT INTO tweets (id, user_id, content)',
                mqLabel: 'fan-out tweet_{id}',
            },
            {
                id: 'follow-user',
                label: 'Follow user',
                method: 'write',
                weight: 0.05,
                sampleIds: [
                    'user_001', 'user_048', 'user_119', 'user_204', 'user_317',
                ],
                dbLabel: 'INSERT INTO follows (follower_id, followee_id)',
            },
        ],
    },
};

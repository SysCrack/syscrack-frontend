import type { ScenarioTemplate } from '../types';
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import { TEMPLATE_SCHEMA_VERSION } from '../types';

const nodes: CanvasNode[] = [
    {
        id: 'url-client',
        type: 'client',
        name: 'Client',
        x: 100, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
        },
        specificConfig: { requestsPerSecond: 500, readWriteRatio: 0.95 }, // readWriteRatio ignored when workloadProfile is active
    },
    {
        id: 'url-cdn',
        type: 'cdn',
        name: 'CDN',
        x: 300, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
        },
        specificConfig: { cacheTtl: 3600, originShield: false, edgeLocations: 10, hitRate: 0.7 },
    },
    {
        id: 'url-lb',
        type: 'load_balancer',
        name: 'Load Balancer',
        x: 500, y: 250,
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
        id: 'url-app',
        type: 'app_server',
        name: 'App Server',
        x: 700, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 2, nodeCapacityRps: 400 },
            resilience: { circuitBreaker: false, automaticRetries: false },
        },
        specificConfig: { instanceType: 'medium', autoScaling: true, minInstances: 1, maxInstances: 10, distributedTransaction: 'none', sagaCompensation: 'choreography' },
    },
    {
        id: 'url-cache',
        type: 'cache',
        name: 'Cache',
        x: 900, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 1, nodeCapacityRps: 10000 },
            consistency: { replicationStrategy: 'leader-follower', replicationFactor: 1 },
        },
        specificConfig: {
            engine: 'redis',
            maxMemory: '1GB',
            clusterMode: false,
            readStrategy: 'cache-aside',
            writeStrategy: 'write-through',
            evictionPolicy: 'lru',
            defaultTtl: 3600,
            maxEntries: 10000,
        },
    },
    {
        id: 'url-db',
        type: 'database_sql',
        name: 'Database',
        x: 1100, y: 250,
        width: 160, height: 80,
        sharedConfig: {
            deployment: { region: 'us-east-1' },
            display: { mode: 'expanded' },
            scaling: { instances: 1, nodeCapacityRps: 500 },
            consistency: { replicationStrategy: 'leader-follower', replicationFactor: 1 },
        },
        specificConfig: {
            engine: 'postgresql',
            instanceType: 'medium',
            readReplicas: 0,
            connectionPooling: true,
            replication: {
                mode: 'single-leader',
                syncMode: 'asynchronous',
                replicationLagMs: 100,
                lagVarianceMs: 20,
                catchUpOnFailover: false,
            },
            isolation: 'read-committed',
            storageEngine: { type: 'b-tree', bloomFilters: false, compactionStrategy: 'leveled' },
            sharding: { enabled: false, strategy: 'hash-based', shardKey: 'id', shardCount: 4, consistentHashing: true, hotspotFactor: 0.0 },
        },
    },
];

const connections: CanvasConnection[] = [
    { id: 'url-c-cdn', sourceId: 'url-client', targetId: 'url-cdn', protocol: 'http', bidirectional: false },
    { id: 'url-cdn-lb', sourceId: 'url-cdn', targetId: 'url-lb', protocol: 'http', bidirectional: false },
    { id: 'url-lb-app', sourceId: 'url-lb', targetId: 'url-app', protocol: 'http', bidirectional: false },
    { id: 'url-app-cache', sourceId: 'url-app', targetId: 'url-cache', protocol: 'http', bidirectional: false },
    { id: 'url-cache-db', sourceId: 'url-cache', targetId: 'url-db', protocol: 'http', bidirectional: false },
];

export const urlShortenerTemplate: ScenarioTemplate = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: 'url-shortener',
    name: 'URL Shortener',
    difficulty: 'beginner',
    category: 'classic',
    description: 'A read-heavy URL redirection service where CDN and cache absorb most traffic, keeping DB writes minimal.',
    designRationale:
        'URL shorteners are read-heavy — redirects outnumber shortens 100:1. ' +
        'The CDN absorbs most redirect traffic since short URLs rarely change. ' +
        'Cache handles remaining read pressure. The DB only sees writes and cache ' +
        'misses. Try removing the cache and watch DB RPS spike.',
    tags: ['caching', 'read-heavy', 'cdn'],
    nodes,
    connections,
    scoringRubric: [
        {
            id: 'url-cache-present',
            description: 'Cache between App Server and DB',
            checkType: 'topology',
            weight: 'required',
            params: { sourceType: 'app_server', targetType: 'cache' },
        },
        {
            id: 'url-cdn-present',
            description: 'CDN present upstream',
            checkType: 'topology',
            weight: 'required',
            params: { nodeType: 'cdn' },
        },
        {
            id: 'url-app-replicas',
            description: 'App Server has 2+ replicas',
            checkType: 'config',
            weight: 'bonus',
            params: { nodeType: 'app_server', field: 'instances', min: 2 },
        },
        {
            id: 'url-cache-eviction',
            description: 'Cache uses LRU or LFU',
            checkType: 'config',
            weight: 'bonus',
            params: { nodeType: 'cache', field: 'evictionPolicy', oneOf: ['lru', 'lfu'] },
        },
    ],
    workloadRef: 'url-shortener-v1',
    workloadProfile: {
        readLabel: 'Redirects',
        writeLabel: 'Shortens',
        archetypes: [
            {
                id: 'redirect-lookup',
                label: 'Redirect lookup',
                method: 'read',
                weight: 0.95,
                cacheKeyPattern: 'redirect:{id}',
                sampleIds: [
                    'x7k2m', 'p9qa1', 'r3tz8', 'h6wbn', 'q2lxp',
                    'y8mfc', 'k4nva', 'b1sjd', 'w5ork', 'g9ehu',
                    'n7cqi', 'z3fpv', 'm2ydw', 'a6rlx', 'd0tbk',
                    'j5ums', 'e8cwn', 'f4gip', 'v1hze', 'c9bqt',
                ],
                sampleData: [
                    { id: 'x7k2m', preview: 'https://github.com/torvalds/linux' },
                    { id: 'p9qa1', preview: 'https://docs.google.com/spreadsheets/...' },
                    { id: 'r3tz8', preview: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
                    { id: 'h6wbn', preview: 'https://news.ycombinator.com/item?id=38234511' },
                    { id: 'q2lxp', preview: 'https://arxiv.org/abs/2303.08774' },
                    { id: 'y8mfc', preview: 'https://stackoverflow.com/questions/11227809' },
                    { id: 'k4nva', preview: 'https://en.wikipedia.org/wiki/CAP_theorem' },
                    { id: 'b1sjd', preview: 'https://stripe.com/docs/api/charges' },
                    { id: 'w5ork', preview: 'https://aws.amazon.com/s3/pricing/' },
                    { id: 'g9ehu', preview: 'https://reactflow.dev/docs/quickstart' },
                ],
                dbLabel: 'SELECT url FROM urls WHERE code = ?',
            },
            {
                id: 'shorten-url',
                label: 'Shorten URL',
                method: 'write',
                weight: 0.05,
                cacheKeyPattern: 'redirect:{id}',
                sampleIds: [
                    'x7k2m', 'p9qa1', 'r3tz8', 'h6wbn', 'q2lxp',
                    'y8mfc', 'k4nva', 'b1sjd', 'w5ork', 'g9ehu',
                    'n7cqi', 'z3fpv', 'm2ydw', 'a6rlx', 'd0tbk',
                    'j5ums', 'e8cwn', 'f4gip', 'v1hze', 'c9bqt',
                ],
                dbLabel: 'INSERT INTO urls (code, url) VALUES (?, ?)',
            },
        ],
    },
};

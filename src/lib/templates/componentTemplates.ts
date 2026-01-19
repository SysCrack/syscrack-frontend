/**
 * Component Templates - Default configs and visual styles for each component type
 */
import { ComponentType } from '@/lib/types/design';

export interface ComponentTemplate {
    type: ComponentType;
    label: string;
    icon: string;
    color: string;
    defaultConfig: Record<string, unknown>;
}

/**
 * Templates for all system component types
 */
export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
    {
        type: ComponentType.CLIENT,
        label: 'Client',
        icon: '🌐',
        color: '#868e96',
        defaultConfig: {},
    },
    {
        type: ComponentType.LOAD_BALANCER,
        label: 'Load Balancer',
        icon: '⚖️',
        color: '#1971c2',
        defaultConfig: {
            layer: 'L7',
            algorithm: 'round_robin',
            ssl_termination: true,
            max_connections: 10000,
        },
    },
    {
        type: ComponentType.APP_SERVER,
        label: 'App Server',
        icon: '🖥️',
        color: '#7950f2',
        defaultConfig: {
            runtime: 'python',
            instances: 3,
            cpu_cores: 2,
            memory_gb: 4,
            stateless: true,
            connection_pooling: true,
            concurrency_model: 'async',
        },
    },
    {
        type: ComponentType.DATABASE,
        label: 'Database',
        icon: '💾',
        color: '#2f9e44',
        defaultConfig: {
            type: 'relational',
            engine: 'postgres',
            instance_type: 'db.m5.large',
            storage_gb: 100,
            read_replicas: 0,
            sharding: false,
            replication_mode: 'async',
            connection_pooling: true,
        },
    },
    {
        type: ComponentType.CACHE,
        label: 'Cache',
        icon: '⚡',
        color: '#f59f00',
        defaultConfig: {
            type: 'redis',
            memory_gb: 16,
            eviction_policy: 'lru',
            persistence: false,
            cluster_mode: false,
            write_strategy: 'cache_aside',
        },
    },
    {
        type: ComponentType.MESSAGE_QUEUE,
        label: 'Queue',
        icon: '📮',
        color: '#e03131',
        defaultConfig: {
            type: 'kafka',
            partitions: 10,
            replication_factor: 3,
            delivery_guarantee: 'at_least_once',
            ordering: 'partition',
            retention_hours: 168,
        },
    },
    {
        type: ComponentType.CDN,
        label: 'CDN',
        icon: '🌍',
        color: '#1098ad',
        defaultConfig: {
            provider: 'cloudflare',
            edge_locations: 200,
            cache_ttl_sec: 3600,
            dynamic_content: false,
            origin_shield: false,
        },
    },
    {
        type: ComponentType.OBJECT_STORAGE,
        label: 'Storage',
        icon: '🗄️',
        color: '#5f3dc4',
        defaultConfig: {
            provider: 's3',
            storage_class: 'standard',
            replication: 'single_region',
            transfer_acceleration: false,
        },
    },
];

/**
 * Get template by component type
 */
export function getComponentTemplate(type: ComponentType): ComponentTemplate | undefined {
    return COMPONENT_TEMPLATES.find(t => t.type === type);
}

/**
 * Get default config for a component type
 */
export function getDefaultConfig(type: ComponentType): Record<string, unknown> {
    return getComponentTemplate(type)?.defaultConfig || {};
}

/**
 * Get lighter shade of a hex color (for backgrounds)
 */
export function getLighterColor(hex: string, opacity = 0.15): string {
    // Convert hex to RGB then return with opacity
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

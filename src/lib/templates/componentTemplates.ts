// Component template definitions with visual styles and default configurations
// Used by the canvas and inspector to render and configure system components

export type ComponentType =
    | 'client'
    | 'load_balancer'
    | 'app_server'
    | 'database'
    | 'cache'
    | 'message_queue'
    | 'cdn'
    | 'object_storage';

// Shape types for Excalidraw elements
export type ShapeType = 'rectangle' | 'ellipse' | 'diamond';

// Visual template for rendering on canvas
export interface VisualTemplate {
    shape: ShapeType;
    width: number;
    height: number;
    strokeColor: string;
    backgroundColor: string;
    icon: string;
    label: string;
}

// Capacity specifications for display
export interface CapacitySpec {
    max_throughput_qps: number;
    base_latency_ms: number;
    cost_per_month: number;
}

// Component-specific configurations
export interface LoadBalancerConfig {
    algorithm: 'round_robin' | 'least_connections' | 'ip_hash';
    max_connections: number;
    health_check_interval_sec: number;
}

export interface DatabaseConfig {
    engine: 'postgres' | 'mysql' | 'mongodb';
    instance_type: 'db.t3.medium' | 'db.m5.large' | 'db.m5.xlarge';
    storage_gb: number;
    read_replicas: number;
    sharding: boolean;
}

export interface CacheConfig {
    memory_gb: number;
    eviction_policy: 'lru' | 'lfu' | 'fifo';
    persistence: boolean;
    cluster_mode: boolean;
}

export interface AppServerConfig {
    instances: number;
    cpu_cores: number;
    memory_gb: number;
    stateless: boolean;
}

export interface MessageQueueConfig {
    partitions: number;
    replication_factor: number;
    retention_hours: number;
}

export interface CDNConfig {
    edge_locations: number;
    cache_ttl_sec: number;
    origin_shield: boolean;
}

export interface ObjectStorageConfig {
    storage_class: 'standard' | 'infrequent' | 'archive';
    versioning: boolean;
    replication: boolean;
}

export interface ClientConfig {
    expected_users: number;
    requests_per_user: number;
}

// Union type for all configs
export type ComponentConfig =
    | LoadBalancerConfig
    | DatabaseConfig
    | CacheConfig
    | AppServerConfig
    | MessageQueueConfig
    | CDNConfig
    | ObjectStorageConfig
    | ClientConfig;

// Complete template for a component
export interface ComponentTemplate {
    type: ComponentType;
    visual: VisualTemplate;
    defaultConfig: ComponentConfig;
    capacity: CapacitySpec;
}

// Lighter color generator for backgrounds
function getLighterColor(hex: string): string {
    // Convert hex to RGB, lighten, and return
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Mix with white (lighter by 80%)
    const lighten = (c: number) => Math.round(c + (255 - c) * 0.85);

    return `#${lighten(r).toString(16).padStart(2, '0')}${lighten(g).toString(16).padStart(2, '0')}${lighten(b).toString(16).padStart(2, '0')}`;
}

// Template definitions for all 8 component types
export const COMPONENT_TEMPLATES: Record<ComponentType, ComponentTemplate> = {
    client: {
        type: 'client',
        visual: {
            shape: 'ellipse',
            width: 120,
            height: 80,
            strokeColor: '#868e96',
            backgroundColor: getLighterColor('#868e96'),
            icon: '🌐',
            label: 'Client',
        },
        defaultConfig: {
            expected_users: 1000000,
            requests_per_user: 10,
        } as ClientConfig,
        capacity: {
            max_throughput_qps: 0, // Client generates requests
            base_latency_ms: 0,
            cost_per_month: 0,
        },
    },

    load_balancer: {
        type: 'load_balancer',
        visual: {
            shape: 'diamond',
            width: 140,
            height: 90,
            strokeColor: '#1971c2',
            backgroundColor: getLighterColor('#1971c2'),
            icon: '⚖️',
            label: 'Load Balancer',
        },
        defaultConfig: {
            algorithm: 'round_robin',
            max_connections: 10000,
            health_check_interval_sec: 30,
        } as LoadBalancerConfig,
        capacity: {
            max_throughput_qps: 100000,
            base_latency_ms: 1,
            cost_per_month: 50,
        },
    },

    app_server: {
        type: 'app_server',
        visual: {
            shape: 'rectangle',
            width: 140,
            height: 90,
            strokeColor: '#7950f2',
            backgroundColor: getLighterColor('#7950f2'),
            icon: '🖥️',
            label: 'App Server',
        },
        defaultConfig: {
            instances: 3,
            cpu_cores: 4,
            memory_gb: 16,
            stateless: true,
        } as AppServerConfig,
        capacity: {
            max_throughput_qps: 5000,
            base_latency_ms: 50,
            cost_per_month: 240,
        },
    },

    database: {
        type: 'database',
        visual: {
            shape: 'rectangle',
            width: 140,
            height: 90,
            strokeColor: '#2f9e44',
            backgroundColor: getLighterColor('#2f9e44'),
            icon: '💾',
            label: 'Database',
        },
        defaultConfig: {
            engine: 'postgres',
            instance_type: 'db.m5.large',
            storage_gb: 100,
            read_replicas: 0,
            sharding: false,
        } as DatabaseConfig,
        capacity: {
            max_throughput_qps: 10000,
            base_latency_ms: 5,
            cost_per_month: 500,
        },
    },

    cache: {
        type: 'cache',
        visual: {
            shape: 'rectangle',
            width: 140,
            height: 90,
            strokeColor: '#f59f00',
            backgroundColor: getLighterColor('#f59f00'),
            icon: '⚡',
            label: 'Cache',
        },
        defaultConfig: {
            memory_gb: 16,
            eviction_policy: 'lru',
            persistence: false,
            cluster_mode: false,
        } as CacheConfig,
        capacity: {
            max_throughput_qps: 100000,
            base_latency_ms: 1,
            cost_per_month: 200,
        },
    },

    message_queue: {
        type: 'message_queue',
        visual: {
            shape: 'rectangle',
            width: 140,
            height: 90,
            strokeColor: '#e03131',
            backgroundColor: getLighterColor('#e03131'),
            icon: '📮',
            label: 'Message Queue',
        },
        defaultConfig: {
            partitions: 12,
            replication_factor: 3,
            retention_hours: 168, // 7 days
        } as MessageQueueConfig,
        capacity: {
            max_throughput_qps: 50000,
            base_latency_ms: 10,
            cost_per_month: 300,
        },
    },

    cdn: {
        type: 'cdn',
        visual: {
            shape: 'ellipse',
            width: 120,
            height: 80,
            strokeColor: '#1098ad',
            backgroundColor: getLighterColor('#1098ad'),
            icon: '🌍',
            label: 'CDN',
        },
        defaultConfig: {
            edge_locations: 200,
            cache_ttl_sec: 86400, // 24 hours
            origin_shield: true,
        } as CDNConfig,
        capacity: {
            max_throughput_qps: 1000000,
            base_latency_ms: 10,
            cost_per_month: 0, // Usage-based
        },
    },

    object_storage: {
        type: 'object_storage',
        visual: {
            shape: 'rectangle',
            width: 140,
            height: 90,
            strokeColor: '#5f3dc4',
            backgroundColor: getLighterColor('#5f3dc4'),
            icon: '🗄️',
            label: 'Object Storage',
        },
        defaultConfig: {
            storage_class: 'standard',
            versioning: true,
            replication: false,
        } as ObjectStorageConfig,
        capacity: {
            max_throughput_qps: 5500,
            base_latency_ms: 100,
            cost_per_month: 0, // Usage-based ~$0.023/GB
        },
    },
};

/**
 * Get the default configuration for a component type
 */
export function getDefaultConfig(type: ComponentType): ComponentConfig {
    return { ...COMPONENT_TEMPLATES[type].defaultConfig };
}

/**
 * Get metadata for displaying a component (icon, label, color, capacity)
 */
export function getComponentMeta(type: ComponentType): {
    icon: string;
    label: string;
    color: string;
    capacity: CapacitySpec;
} {
    const template = COMPONENT_TEMPLATES[type];
    return {
        icon: template.visual.icon,
        label: template.visual.label,
        color: template.visual.strokeColor,
        capacity: template.capacity,
    };
}

/**
 * Get the visual template for rendering on canvas
 */
export function getVisualTemplate(type: ComponentType): VisualTemplate {
    return COMPONENT_TEMPLATES[type].visual;
}

/**
 * Get all component types
 */
export function getAllComponentTypes(): ComponentType[] {
    return Object.keys(COMPONENT_TEMPLATES) as ComponentType[];
}

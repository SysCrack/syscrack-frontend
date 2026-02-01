/**
 * Type definitions for the systems design application.
 * These types define the component structures used in the Excalidraw canvas.
 */

/**
 * Base interface representing Excalidraw element properties we use.
 * This avoids importing from internal Excalidraw paths that may not be exposed.
 */
export interface ExcalidrawElementBase<TCustomData = Record<string, unknown>> {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly type: string;
    readonly strokeColor: string;
    readonly backgroundColor: string;
    readonly isDeleted: boolean;
    customData?: TCustomData;
}
/**
 * Enum representing all available system component types
 */
export enum ComponentType {
    CLIENT = 'client',
    LOAD_BALANCER = 'load_balancer',
    APP_SERVER = 'app_server',
    WEB_SERVER = 'web_server',
    DATABASE = 'database',
    CACHE = 'cache',
    MESSAGE_QUEUE = 'message_queue',
    CDN = 'cdn',
    OBJECT_STORAGE = 'object_storage',
}

/**
 * Configuration for Load Balancer component
 */
export interface LoadBalancerConfig {
    algorithm: 'round_robin' | 'least_connections' | 'ip_hash';
    max_connections: number;
    health_check_interval_sec: number;
    estimated_cost: number;
}

/**
 * Configuration for Database component
 */
export interface DatabaseConfig {
    engine: 'postgres' | 'mysql' | 'mongodb' | 'dynamodb';
    instance_type: 'db.t3.medium' | 'db.m5.large' | 'db.m5.xlarge' | 'db.m5.2xlarge';
    storage_gb: number;
    read_replicas: number;
    sharding: boolean;
    estimated_cost: number;
}

/**
 * Configuration for Cache component
 */
export interface CacheConfig {
    memory_gb: number;
    eviction_policy: 'lru' | 'lfu' | 'ttl';
    persistence: boolean;
    cluster_mode: boolean;
    estimated_cost: number;
}

/**
 * Configuration for App Server component
 */
export interface AppServerConfig {
    instances: number;
    cpu_cores: 2 | 4 | 8 | 16;
    memory_gb: number;
    stateless: boolean;
    estimated_cost: number;
}

/**
 * Configuration for Web Server component
 */
export interface WebServerConfig {
    instances: number;
    cpu_cores: 2 | 4 | 8;
    memory_gb: number;
    estimated_cost: number;
}

/**
 * Configuration for Message Queue component
 */
export interface MessageQueueConfig {
    partitions: number;
    replication_factor: number;
    retention_hours: number;
    estimated_cost: number;
}

/**
 * Configuration for CDN component
 */
export interface CDNConfig {
    edge_locations: 'basic' | 'standard' | 'premium';
    cache_ttl_seconds: number;
    estimated_cost: number;
}

/**
 * Configuration for Object Storage component
 */
export interface ObjectStorageConfig {
    storage_class: 'standard' | 'infrequent_access' | 'archive';
    estimated_gb: number;
    estimated_cost: number;
}

/**
 * Configuration for Client component
 */
export interface ClientConfig {
    type: 'web' | 'mobile' | 'api';
    estimated_users: number;
}

/**
 * Union type of all component configurations
 */
export type ComponentConfig =
    | LoadBalancerConfig
    | DatabaseConfig
    | CacheConfig
    | AppServerConfig
    | WebServerConfig
    | MessageQueueConfig
    | CDNConfig
    | ObjectStorageConfig
    | ClientConfig;

/**
 * Custom data attached to Excalidraw elements representing system components
 */
export interface SystemComponentCustomData {
    isSystemComponent: true;
    componentType: ComponentType;
    componentConfig: ComponentConfig;
    componentId: string;
}

/**
 * Protocol types for connections between components
 */
export type ConnectionProtocol = 'http' | 'https' | 'grpc' | 'message_queue' | 'tcp';

/**
 * Custom data attached to Excalidraw arrows representing system connections
 */
export interface SystemConnectionCustomData {
    isSystemConnection: true;
    protocol: ConnectionProtocol;
    throughput_qps: number;
    data_contract?: {
        request: string;
        response: string;
    };
}

/**
 * Extended Excalidraw element type for system components
 */
export interface SystemComponentElement extends ExcalidrawElementBase<SystemComponentCustomData> {
    customData: SystemComponentCustomData;
}

/**
 * Extended Excalidraw element type for system connections
 */
export interface SystemConnectionElement extends ExcalidrawElementBase<SystemConnectionCustomData> {
    customData: SystemConnectionCustomData;
}

/**
 * Parsed component from the canvas
 */
export interface Component {
    id: string;
    type: ComponentType;
    name: string;
    config: ComponentConfig;
    position: { x: number; y: number };
}

/**
 * Parsed connection from the canvas
 */
export interface Connection {
    id: string;
    source_id: string;
    target_id: string;
    protocol: ConnectionProtocol;
    throughput_qps: number;
    data_contract?: {
        request: string;
        response: string;
    };
}

/**
 * Complete system design structure for API communication
 */
export interface SystemDesign {
    components: Component[];
    connections: Connection[];
    warnings: string[];
    entryPoint: string | null;
}

/**
 * Type guard to check if an element is a system component
 */
export function isSystemComponent(element: ExcalidrawElementBase<unknown>): element is SystemComponentElement {
    const data = element.customData as unknown as SystemComponentCustomData | undefined;
    return data !== undefined && data.isSystemComponent === true;
}

/**
 * Type guard to check if an element is a system connection
 */
export function isSystemConnection(element: ExcalidrawElementBase<unknown>): element is SystemConnectionElement {
    const data = element.customData as unknown as SystemConnectionCustomData | undefined;
    return data !== undefined && data.isSystemConnection === true;
}

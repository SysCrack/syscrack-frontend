/**
 * TypeScript types for System Design API
 * Matches backend Pydantic schemas in system_design.py
 */

// ============ Enums ============

export enum ComponentType {
    CLIENT = 'client',
    LOAD_BALANCER = 'load_balancer',
    WEB_SERVER = 'web_server',
    APP_SERVER = 'app_server',
    DATABASE = 'database',
    CACHE = 'cache',
    MESSAGE_QUEUE = 'message_queue',
    CDN = 'cdn',
    OBJECT_STORAGE = 'object_storage',
}

export enum SimulationStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

// ============ Component Configurations ============

export interface LoadBalancerConfig {
    layer: 'L4' | 'L7';
    algorithm: 'round_robin' | 'least_connections' | 'ip_hash';
    ssl_termination: boolean;
    health_check_type: 'tcp' | 'http';
    max_connections: number;
    sticky_sessions: boolean;
}

export interface DatabaseConfig {
    type: 'relational' | 'nosql' | 'search' | 'timeseries';
    engine: 'postgres' | 'mysql' | 'mongodb' | 'cassandra' | 'elasticsearch' | 'timescaledb';
    instance_type: string;
    storage_gb: number;
    read_replicas: number;
    sharding: boolean;
    replication_mode: 'sync' | 'async';
    connection_pooling: boolean;
}

export interface CacheConfig {
    type: 'redis' | 'memcached';
    memory_gb: number;
    eviction_policy: 'lru' | 'lfu' | 'ttl';
    persistence: boolean;
    cluster_mode: boolean;
    write_strategy: 'cache_aside' | 'write_through' | 'write_back';
}

export interface AppServerConfig {
    runtime: 'python' | 'go' | 'java' | 'nodejs';
    instances: number;
    cpu_cores: number;
    memory_gb: number;
    stateless: boolean;
    connection_pooling: boolean;
    concurrency_model: 'sync' | 'async';
}

export interface MessageQueueConfig {
    type: 'kafka' | 'rabbitmq' | 'sqs';
    partitions: number;
    replication_factor: number;
    delivery_guarantee: 'at_most_once' | 'at_least_once' | 'exactly_once';
    ordering: 'none' | 'partition' | 'global';
    retention_hours: number;
}

export interface CDNConfig {
    provider: 'cloudflare' | 'cloudfront' | 'fastly';
    edge_locations: number;
    cache_ttl_sec: number;
    dynamic_content: boolean;
    origin_shield: boolean;
}

export interface ObjectStorageConfig {
    provider: 's3' | 'gcs' | 'azure_blob';
    storage_class: 'standard' | 'infrequent' | 'archive';
    replication: 'single_region' | 'multi_region';
    transfer_acceleration: boolean;
}

export type ComponentConfig =
    | LoadBalancerConfig
    | DatabaseConfig
    | CacheConfig
    | AppServerConfig
    | MessageQueueConfig
    | CDNConfig
    | ObjectStorageConfig
    | Record<string, unknown>; // For client and other simple types

// ============ Component & Connection Types ============

export interface ComponentCreate {
    id?: string;
    type: ComponentType;
    name: string;
    config: ComponentConfig;
    position?: { x: number; y: number };
}

export interface ComponentOut {
    id: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number };
    created_at: string;
}

export type Protocol =
    | 'http' | 'https' | 'grpc' | 'websocket'
    | 'amqp' | 'kafka_wire'
    | 'sql' | 'redis' | 's3'
    | 'tcp' | 'udp';

export interface ConnectionCreate {
    id?: string;
    source_id: string;
    target_id: string;
    protocol: Protocol;
    throughput_qps?: number;
    data_contract?: Record<string, unknown>;
}

export interface ConnectionOut {
    id: string;
    source_id: string;
    target_id: string;
    protocol: string;
    throughput_qps?: number;
    data_contract?: Record<string, unknown>;
    created_at: string;
}

// ============ Design Types ============

export interface DesignCreate {
    problem_id: number;
    canvas_data?: Record<string, unknown>;
    components: ComponentCreate[];
    connections: ConnectionCreate[];
}

export interface DesignUpdate {
    canvas_data?: Record<string, unknown>;
    components: ComponentCreate[];
    connections: ConnectionCreate[];
}

export interface DesignOut {
    id: number;
    problem_id: number;
    user_id: string;
    created_at: string;
    updated_at: string;
}

export interface DesignDetailOut extends DesignOut {
    canvas_data?: Record<string, unknown>;
    components: ComponentOut[];
    connections: ConnectionOut[];
}

// ============ Validation Types ============

export interface ValidationError {
    code: string;
    message: string;
    component_id?: string;
}

export interface ValidationWarning {
    code: string;
    message: string;
    component_id?: string;
}

export interface ValidationResponse {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

// ============ Simulation Types ============

export interface UserEstimates {
    max_throughput_qps: number;
    expected_p99_latency_ms: number;
    estimated_cost_monthly: number;
}

export interface SimulationRequest {
    scenarios?: string[];
    user_estimates?: UserEstimates;
}

export interface SimulationMetrics {
    throughput_qps: number;
    avg_latency_ms: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    error_rate: number;
    estimated_cost_monthly: number;
    bottlenecks: string[];
    single_points_of_failure: string[];
}

export interface ScenarioResult {
    scenario: string;
    passed: boolean;
    score: number;
    max_score: number;
    metrics: SimulationMetrics;
    feedback: string[];
}

export interface GradingCheck {
    requirement: string;
    passed: boolean;
    details: string;
}

export interface GradingResult {
    passed_all: boolean;
    checks: GradingCheck[];
    feedback: string[];
}

export interface MetricComparison {
    estimated: number;
    actual: number;
    difference_percent: number;
    accuracy: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface EstimationComparison {
    throughput: MetricComparison;
    latency: MetricComparison;
    cost: MetricComparison;
    accuracy_score: number;
    bonus_points: number;
}

export interface SimulationResponse {
    job_id: string;
    status: SimulationStatus;
    progress: number;
    current_scenario?: string;
    results?: ScenarioResult[];
    total_score?: number;
    estimation_comparison?: EstimationComparison;
    grading_result?: GradingResult;
    error?: string;
}

// ============ Problem Types ============

export interface SystemDesignProblemList {
    id: number;
    title: string;
    slug: string;
    difficulty: string;
    is_premium_only: boolean;
}


export interface ProblemDefinition {
    functional_requirements: string[];
    non_functional_requirements: string[];
    assumptions: string[];
    estimated_usage: { label: string; value: string }[];
    example?: { input: string; output: string };
}

export interface SystemDesignProblemDetail extends SystemDesignProblemList {
    description: string;
    definition: ProblemDefinition;
    requirements: Record<string, unknown>;
    api_endpoints?: unknown[];
    test_scenarios: string[];
    hints?: string[];
}

// ============ Concept Grading Types ============

export interface ConceptFeedbackItem {
    rule_id: string;
    category: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    message: string;
    penalty: number;
}

export interface TradeOffIssue {
    component: string;
    issue: string;
    suggestion: string;
}

export interface TradeOffAnalysis {
    score_bonus: number;
    issues: TradeOffIssue[];
}

export interface OptimalComponentComparison {
    component: string;
    result: 'match' | 'acceptable' | 'suboptimal' | 'incorrect';
    user_choice: string;
    optimal_choice: string;
    explanation: string;
}

export interface OptimalComparisonResult {
    match_percentage: number;
    summary: string;
    components: OptimalComponentComparison[];
}

export interface ConceptGradingResponse {
    total_score: number;
    summary_feedback: string;
    concept_feedback: ConceptFeedbackItem[];
    trade_off_analysis?: TradeOffAnalysis;
    optimal_comparison?: OptimalComparisonResult;
}


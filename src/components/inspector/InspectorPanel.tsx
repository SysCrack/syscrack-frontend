import { useState, useEffect, useMemo } from 'react';
import { X, RotateCcw, Info, Wallet } from 'lucide-react';
import { ExcalidrawElement } from '@/components/canvas/SystemDesignCanvas';
import { isSystemComponent, SystemComponentData } from '@/lib/utils/sceneParser';
import { getDefaultConfig, getComponentTemplate } from '@/lib/templates/componentTemplates';
import { ComponentType } from '@/lib/types/design';
import { calculateComponentCost, formatCost } from '@/lib/utils/costCalculator';

// Modular Field Imports
import { SelectField } from './fields/SelectField';
import { NumberField } from './fields/NumberField';
import { ToggleField } from './fields/ToggleField';

interface InspectorPanelProps {
    element: ExcalidrawElement | null;
    onUpdate: (elementId: string, newConfig: Record<string, unknown>) => void;
    onClose: () => void;
}

export function InspectorPanel({ element, onUpdate, onClose }: InspectorPanelProps) {
    const [config, setConfig] = useState<Record<string, unknown>>({});
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (element && isSystemComponent(element)) {
            const data = element.customData as unknown as SystemComponentData;
            setConfig(data.componentConfig || {});
            setIsDirty(false);
        }
    }, [element]);

    // Calculate cost in real-time
    const currentCost = useMemo(() => {
        if (element && isSystemComponent(element)) {
            const data = element.customData as unknown as SystemComponentData;
            return calculateComponentCost(data.componentType, config);
        }
        return 0;
    }, [element, config]);

    if (!element || !isSystemComponent(element)) {
        return null;
    }

    const data = element.customData as unknown as SystemComponentData;
    const template = getComponentTemplate(data.componentType);

    const handleChange = (updates: Record<string, any>) => {
        const newConfig = { ...config, ...updates };
        setConfig(newConfig);
        setIsDirty(true);
        // Live update
        onUpdate(element.id, newConfig);
    };

    const handleReset = () => {
        const defaults = getDefaultConfig(data.componentType);
        setConfig(defaults);
        onUpdate(element.id, defaults);
    };

    return (
        <div className="fixed md:absolute bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:top-20 md:right-4 z-[55] w-full md:w-72 bg-[var(--color-panel-bg)] border-t md:border border-[var(--color-border)] rounded-t-2xl md:rounded-xl shadow-2xl flex flex-col max-h-[70vh] md:max-h-[calc(100vh-120px)] animate-in slide-in-from-bottom md:slide-in-from-right-10 fade-in duration-200 overflow-hidden">
            {/* Mobile Drag Handle */}
            <div className="md:hidden w-12 h-1 bg-[var(--color-border)] rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--color-canvas-bg)] border border-[var(--color-border)] flex items-center justify-center text-2xl shadow-sm">
                        {template?.icon}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-[var(--color-text-primary)] tracking-tight">
                            {template?.label || 'Component'}
                        </h3>
                        <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono uppercase opacity-70">
                            ID: {element.id.slice(0, 8)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleReset}
                        className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-all"
                        title="Reset to defaults"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-[var(--color-bg-secondary)] rounded-lg transition-all"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Form Content */}
            <div className="p-5 overflow-y-auto space-y-6 custom-scrollbar bg-[var(--color-panel-bg)]">
                {renderFormFields(data.componentType, config, handleChange)}
            </div>

            {/* Footer: Cost & Meta */}
            <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between mt-auto">
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    <Wallet className="h-4 w-4 text-[var(--color-primary)]" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Est. Cost</span>
                </div>
                <div className="text-sm font-bold text-[var(--color-primary)] animate-in fade-in zoom-in duration-300">
                    {formatCost(currentCost)}
                </div>
            </div>
        </div>
    );
}

// Configuration capabilities and rules
const COMPONENT_RULES: Record<string, any> = {
    [ComponentType.DATABASE]: {
        engines: {
            relational: ['postgres', 'mysql', 'timescaledb'],
            nosql: ['mongodb', 'cassandra', 'dynamodb'],
            search: ['elasticsearch'],
            timeseries: ['timescaledb']
        },
        engineToType: {
            postgres: 'relational',
            mysql: 'relational',
            timescaledb: 'relational',
            mongodb: 'nosql',
            cassandra: 'nosql',
            dynamodb: 'nosql',
            elasticsearch: 'search'
        }
    },
    [ComponentType.CACHE]: {
        types: ['redis', 'memcached'],
        evictionPolicies: {
            redis: ['lru', 'lfu', 'ttl'],
            memcached: ['lru']
        }
    },
    [ComponentType.MESSAGE_QUEUE]: {
        types: ['kafka', 'rabbitmq', 'sqs']
    },
    [ComponentType.LOAD_BALANCER]: {
        layers: ['L4', 'L7'],
        algorithms: ['round_robin', 'least_connections', 'ip_hash']
    },
    [ComponentType.APP_SERVER]: {
        runtimes: ['python', 'go', 'java', 'nodejs']
    },
    [ComponentType.CDN]: {
        providers: ['cloudflare', 'cloudfront', 'fastly']
    },
    [ComponentType.OBJECT_STORAGE]: {
        providers: ['s3', 'gcs', 'azure_blob'],
        classes: ['standard', 'infrequent', 'archive']
    },
    [ComponentType.CLIENT]: {
        platforms: ['web', 'mobile', 'iot']
    }
};

// Helper to render fields based on component type
function renderFormFields(
    type: ComponentType,
    config: Record<string, unknown>,
    onChange: (updates: Record<string, any>) => void
) {
    const handleFieldChange = (key: string, value: any) => {
        const updates: Record<string, any> = { [key]: value };

        // Apply specific rules
        if (type === ComponentType.DATABASE) {
            if (key === 'engine') {
                const mappedType = COMPONENT_RULES[ComponentType.DATABASE].engineToType[value as string];
                if (mappedType) updates.type = mappedType;
            } else if (key === 'type') {
                const validEngines = COMPONENT_RULES[ComponentType.DATABASE].engines[value as string] || [];
                if (!validEngines.includes(config.engine as string)) {
                    updates.engine = validEngines[0];
                }
            }
        } else if (type === ComponentType.CACHE) {
            if (key === 'type' && value === 'memcached') {
                updates.eviction_policy = 'lru';
            }
        }

        onChange(updates);
    };

    switch (type) {
        case ComponentType.DATABASE:
            const allEngines = Object.values(COMPONENT_RULES[ComponentType.DATABASE].engines).flat();
            const uniqueEngines = Array.from(new Set(allEngines as string[]));

            return (
                <>
                    <SelectField
                        label="Engine"
                        value={config.engine as string}
                        options={uniqueEngines}
                        onChange={(v) => handleFieldChange('engine', v)}
                        helpText="The storage technology used for this database."
                    />
                    <SelectField
                        label="Type"
                        value={config.type as string}
                        options={['relational', 'nosql', 'search', 'timeseries']}
                        onChange={(v) => handleFieldChange('type', v)}
                        helpText="Database category determines capabilities."
                    />
                    <NumberField
                        label="Storage"
                        value={config.storage_gb as number}
                        unit="GB"
                        onChange={(v) => handleFieldChange('storage_gb', v)}
                        helpText="Disk space allocated to this instance."
                    />
                    <ToggleField
                        label="Sharding"
                        value={config.sharding as boolean}
                        onChange={(v) => handleFieldChange('sharding', v)}
                        helpText="Enable horizontal partitioning for high write volume."
                    />
                    <NumberField
                        label="Read Replicas"
                        value={config.read_replicas as number}
                        onChange={(v) => handleFieldChange('read_replicas', v)}
                        helpText="Additional nodes to scale read traffic."
                    />
                </>
            );
        case ComponentType.CACHE:
            const cacheType = config.type as string || 'redis';
            const validPolicies = COMPONENT_RULES[ComponentType.CACHE].evictionPolicies[cacheType] || ['lru'];

            return (
                <>
                    <SelectField
                        label="Type"
                        value={config.type as string}
                        options={COMPONENT_RULES[ComponentType.CACHE].types}
                        onChange={(v) => handleFieldChange('type', v)}
                        helpText="Redis supports more features, Memcached is pure speed."
                    />
                    <SelectField
                        label="Eviction Policy"
                        value={config.eviction_policy as string}
                        options={validPolicies}
                        onChange={(v) => handleFieldChange('eviction_policy', v)}
                        helpText="How the cache handles full memory scenarios."
                    />
                    <NumberField
                        label="Memory"
                        value={config.memory_gb as number}
                        unit="GB"
                        onChange={(v) => handleFieldChange('memory_gb', v)}
                        helpText="RAM allocated for caching data."
                    />
                    <ToggleField
                        label="Cluster Mode"
                        value={config.cluster_mode as boolean}
                        onChange={(v) => handleFieldChange('cluster_mode', v)}
                        helpText="Scale the cache horizontally across multiple nodes."
                    />
                </>
            );
        case ComponentType.MESSAGE_QUEUE:
            const isKafka = (config.type || 'kafka') === 'kafka';

            return (
                <>
                    <SelectField
                        label="Type"
                        value={config.type as string}
                        options={COMPONENT_RULES[ComponentType.MESSAGE_QUEUE].types}
                        onChange={(v) => handleFieldChange('type', v)}
                        helpText="Kafka for high-throughput, RabbitMQ for complex routing."
                    />
                    {isKafka && (
                        <NumberField
                            label="Partitions"
                            value={config.partitions as number}
                            onChange={(v) => handleFieldChange('partitions', v)}
                            helpText="Number of parallel processing units in Kafka."
                        />
                    )}
                    <NumberField
                        label="Retention"
                        value={config.retention_hours as number}
                        unit="Hours"
                        onChange={(v) => handleFieldChange('retention_hours', v)}
                        helpText="How long messages stay in the queue."
                    />
                </>
            );
        case ComponentType.LOAD_BALANCER:
            return (
                <>
                    <SelectField
                        label="Layer"
                        value={config.layer as string}
                        options={COMPONENT_RULES[ComponentType.LOAD_BALANCER].layers}
                        onChange={(v) => handleFieldChange('layer', v)}
                        helpText="L4 for TCP speed, L7 for HTTP features like path routing."
                    />
                    <SelectField
                        label="Algorithm"
                        value={config.algorithm as string}
                        options={COMPONENT_RULES[ComponentType.LOAD_BALANCER].algorithms}
                        onChange={(v) => handleFieldChange('algorithm', v)}
                        helpText="How traffic is distributed across healthy targets."
                    />
                    <ToggleField
                        label="SSL Termination"
                        value={config.ssl_termination as boolean}
                        onChange={(v) => handleFieldChange('ssl_termination', v)}
                        helpText="Handle HTTPS encryption at the load balancer level."
                    />
                </>
            );
        case ComponentType.APP_SERVER:
            return (
                <>
                    <SelectField
                        label="Runtime"
                        value={config.runtime as string}
                        options={COMPONENT_RULES[ComponentType.APP_SERVER].runtimes}
                        onChange={(v) => handleFieldChange('runtime', v)}
                        helpText="The programming language environment for your logic."
                    />
                    <NumberField
                        label="Instances"
                        value={config.instances as number}
                        onChange={(v) => handleFieldChange('instances', v)}
                        helpText="Number of horizontal replicas for this service."
                    />
                    <NumberField
                        label="CPU Cores"
                        value={config.cpu_cores as number}
                        onChange={(v) => handleFieldChange('cpu_cores', v)}
                        helpText="Processing power allocated per instance."
                    />
                </>
            );
        case ComponentType.CDN:
            return (
                <>
                    <SelectField
                        label="Provider"
                        value={config.provider as string}
                        options={COMPONENT_RULES[ComponentType.CDN].providers}
                        onChange={(v) => handleFieldChange('provider', v)}
                        helpText="Global content delivery network provider."
                    />
                    <ToggleField
                        label="Dynamic Content"
                        value={config.dynamic_content as boolean}
                        onChange={(v) => handleFieldChange('dynamic_content', v)}
                        helpText="Enable edge computing for dynamic requests."
                    />
                    <ToggleField
                        label="Origin Shield"
                        value={config.origin_shield as boolean}
                        onChange={(v) => handleFieldChange('origin_shield', v)}
                        helpText="Additional caching layer to protect your backend servers."
                    />
                </>
            );
        case ComponentType.OBJECT_STORAGE:
            return (
                <>
                    <SelectField
                        label="Provider"
                        value={config.provider as string}
                        options={COMPONENT_RULES[ComponentType.OBJECT_STORAGE].providers}
                        onChange={(v) => handleFieldChange('provider', v)}
                        helpText="Provider for blob/file storage."
                    />
                    <SelectField
                        label="Storage Class"
                        value={config.storage_class as string}
                        options={COMPONENT_RULES[ComponentType.OBJECT_STORAGE].classes}
                        onChange={(v) => handleFieldChange('storage_class', v)}
                        helpText="Standard for hot data, Archive for cold backups."
                    />
                    <NumberField
                        label="Storage (GB)"
                        value={config.storage_gb as number}
                        unit="GB"
                        onChange={(v) => handleFieldChange('storage_gb', v)}
                        helpText="Total data volume expected in object storage."
                    />
                </>
            );
        case ComponentType.CLIENT:
            return (
                <>
                    <SelectField
                        label="Platform"
                        value={config.platform as string}
                        options={COMPONENT_RULES[ComponentType.CLIENT].platforms}
                        onChange={(v) => handleFieldChange('platform', v)}
                        helpText="The type of client accessing your system."
                    />
                </>
            );
        default:
            return <div className="text-sm text-[var(--color-text-tertiary)] italic">This component has no configurable properties.</div>;
    }
}


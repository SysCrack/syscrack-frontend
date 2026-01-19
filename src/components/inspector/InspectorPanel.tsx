'use client';

import { useState, useEffect } from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import { ExcalidrawElement } from '@/components/canvas/SystemDesignCanvas';
import { isSystemComponent, SystemComponentData } from '@/lib/utils/sceneParser';
import { getDefaultConfig, getComponentTemplate } from '@/lib/templates/componentTemplates';
import { ComponentType } from '@/lib/types/design';

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
        <div className="absolute top-20 right-4 z-[55] w-64 bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-xl shadow-xl flex flex-col max-h-[calc(100vh-350px)] animate-in slide-in-from-right-10 fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] rounded-t-xl">
                <div className="flex items-center gap-2">
                    <span className="text-xl">{template?.icon}</span>
                    <div>
                        <h3 className="font-semibold text-[var(--color-text-primary)]">{template?.label || 'Component'}</h3>
                        <p className="text-xs text-[var(--color-text-tertiary)] font-mono truncate max-w-[120px]">{element.id.slice(0, 8)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleReset}
                        className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
                        title="Reset to defaults"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Form Content */}
            <div className="p-4 overflow-y-auto space-y-4 custom-scrollbar">
                {renderFormFields(data.componentType, config, handleChange)}
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
    }
};

// Helper to render fields based on component type
function renderFormFields(
    type: ComponentType,
    config: Record<string, unknown>,
    onChange: (updates: Record<string, any>) => void
) {
    // Enhanced change handler with validation rules
    const handleFieldChange = (key: string, value: any) => {
        let updates: Record<string, any> = { [key]: value };

        // Apply specific rules
        if (type === ComponentType.DATABASE) {
            if (key === 'engine') {
                // Auto-set type based on engine
                const mappedType = COMPONENT_RULES[ComponentType.DATABASE].engineToType[value as string];
                if (mappedType) {
                    updates.type = mappedType;
                }
            } else if (key === 'type') {
                // Default engine for type if current engine is invalid
                const validEngines = COMPONENT_RULES[ComponentType.DATABASE].engines[value as string] || [];
                if (!validEngines.includes(config.engine as string)) {
                    updates.engine = validEngines[0];
                }
            }
        } else if (type === ComponentType.CACHE) {
            if (key === 'type') {
                // Default to LRU if switching to memcached
                if (value === 'memcached') {
                    updates.eviction_policy = 'lru';
                }
            }
        }

        onChange(updates);
    };

    switch (type) {
        case ComponentType.DATABASE:
            const currentType = config.type as string || 'relational';
            const allEngines = Object.values(COMPONENT_RULES[ComponentType.DATABASE].engines).flat();
            const uniqueEngines = Array.from(new Set(allEngines as string[]));

            return (
                <>
                    <SelectField
                        label="Engine"
                        value={config.engine as string}
                        options={uniqueEngines}
                        onChange={(v) => handleFieldChange('engine', v)}
                    />
                    <SelectField
                        label="Type"
                        value={config.type as string}
                        options={['relational', 'nosql', 'search', 'timeseries']}
                        onChange={(v) => handleFieldChange('type', v)}
                    />
                    <NumberField
                        label="Storage (GB)"
                        value={config.storage_gb as number}
                        onChange={(v) => handleFieldChange('storage_gb', v)}
                    />
                    <ToggleField
                        label="Sharding"
                        value={config.sharding as boolean}
                        onChange={(v) => handleFieldChange('sharding', v)}
                    />
                    <NumberField
                        label="Read Replicas"
                        value={config.read_replicas as number}
                        onChange={(v) => handleFieldChange('read_replicas', v)}
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
                    />
                    <SelectField
                        label="Eviction Policy"
                        value={config.eviction_policy as string}
                        options={validPolicies}
                        onChange={(v) => handleFieldChange('eviction_policy', v)}
                    />
                    <NumberField
                        label="Memory (GB)"
                        value={config.memory_gb as number}
                        onChange={(v) => handleFieldChange('memory_gb', v)}
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
                    />
                    {isKafka && (
                        <NumberField
                            label="Partitions"
                            value={config.partitions as number}
                            onChange={(v) => handleFieldChange('partitions', v)}
                        />
                    )}
                    <NumberField
                        label="Retention (Hours)"
                        value={config.retention_hours as number}
                        onChange={(v) => handleFieldChange('retention_hours', v)}
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
                    />
                    <SelectField
                        label="Algorithm"
                        value={config.algorithm as string}
                        options={COMPONENT_RULES[ComponentType.LOAD_BALANCER].algorithms}
                        onChange={(v) => handleFieldChange('algorithm', v)}
                    />
                    <ToggleField
                        label="SSL Termination"
                        value={config.ssl_termination as boolean}
                        onChange={(v) => handleFieldChange('ssl_termination', v)}
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
                    />
                    <NumberField
                        label="Instances"
                        value={config.instances as number}
                        onChange={(v) => handleFieldChange('instances', v)}
                    />
                    <NumberField
                        label="CPU Cores"
                        value={config.cpu_cores as number}
                        onChange={(v) => handleFieldChange('cpu_cores', v)}
                    />
                </>
            );
        default:
            return <div className="text-sm text-[var(--color-text-tertiary)]">No configuration available for this component.</div>;
    }
}

// Field Components

function SelectField({ label, value, options, onChange }: { label: string, value: string, options: string[], onChange: (v: string) => void }) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</label>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        </div>
    );
}

function NumberField({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</label>
            <input
                type="number"
                value={value || 0}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
        </div>
    );
}

function ToggleField({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between py-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</label>
            <button
                onClick={() => onChange(!value)}
                className={`
                    w-10 h-6 rounded-full transition-colors relative
                    ${value ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}
                `}
            >
                <div
                    className={`
                        absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform
                        ${value ? 'translate-x-4' : 'translate-x-0'}
                    `}
                />
            </button>
        </div>
    );
}

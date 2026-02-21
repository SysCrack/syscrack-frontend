/**
 * ConfigSidebar — config panels for the selected component.
 * Excalidraw-inspired dark theme. Only shown when exactly one node is selected.
 */
'use client';

import { useCanvasStore } from '@/stores/canvasStore';
import { getCatalogEntry } from '@/lib/data/componentCatalog';
import type { CanvasNode, SharedConfig } from '@/lib/types/canvas';

// String enum fields that should be editable via dropdown (component type -> key -> options)
const SPECIFIC_CONFIG_ENUMS: Partial<Record<string, Record<string, string[]>>> = {
    load_balancer: {
        algorithm: ['round-robin', 'least-connections', 'random', 'weighted'],
    },
    cache: {
        readStrategy: ['cache-aside', 'read-through'],
        writeStrategy: ['write-through', 'write-behind', 'write-around'],
        evictionPolicy: ['lru', 'lfu', 'fifo', 'ttl-based', 'random'],
    },
};

export default function ConfigSidebar() {
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const nodes = useCanvasStore((s) => s.nodes);

    const selectedNode = selectedNodeIds.length === 1
        ? nodes.find((n) => n.id === selectedNodeIds[0])
        : null;

    if (!selectedNode) return null;

    return <NodeConfig node={selectedNode} />;
}

function NodeConfig({ node }: { node: CanvasNode }) {
    const catalog = getCatalogEntry(node.type);
    const nodes = useCanvasStore((s) => s.nodes);
    const connections = useCanvasStore((s) => s.connections);
    const updateName = useCanvasStore((s) => s.updateNodeName);
    const updateShared = useCanvasStore((s) => s.updateNodeSharedConfig);
    const updateSpecific = useCanvasStore((s) => s.updateNodeSpecificConfig);
    const removeNode = useCanvasStore((s) => s.removeNode);

    if (!catalog) return null;

    const layers = catalog.applicableLayers;

    return (
        <div
            style={{
                width: 260,
                minWidth: 260,
                flexShrink: 0,
                height: '100%',
                background: '#181e2e',
                borderLeft: '1px solid #2a3244',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, system-ui, sans-serif',
                overflowY: 'auto',
            }}
        >
            {/* Header */}
            <div style={{ padding: 12, borderBottom: '1px solid #2a3244' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 22 }}>{catalog.icon}</span>
                    <input
                        type="text"
                        value={node.name}
                        onChange={(e) => updateName(node.id, e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#e2e8f0',
                            fontSize: 14,
                            fontWeight: 700,
                            outline: 'none',
                            width: '100%',
                            padding: 0,
                        }}
                    />
                </div>
                <div style={{ fontSize: 10, color: '#64748b', paddingLeft: 30 }}>
                    {catalog.description}
                </div>
            </div>

            {/* Deployment */}
            <Section title="Deployment">
                <SelectField
                    label="Region"
                    value={node.sharedConfig.deployment.region}
                    options={['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']}
                    onChange={(v) => updateShared(node.id, { deployment: { region: v as SharedConfig['deployment']['region'] } })}
                />
            </Section>

            {/* Scaling */}
            {layers.scaling && node.sharedConfig.scaling && (
                <Section title="Scaling">
                    <NumberField label="Instances" value={node.sharedConfig.scaling.instances} min={1} max={100}
                        onChange={(v) => updateShared(node.id, { scaling: { ...node.sharedConfig.scaling!, instances: v } })} />
                    <NumberField label="Capacity (RPS)" value={node.sharedConfig.scaling.nodeCapacityRps} min={10} max={100000} step={100}
                        onChange={(v) => updateShared(node.id, { scaling: { ...node.sharedConfig.scaling!, nodeCapacityRps: v } })} />
                </Section>
            )}

            {/* Consistency */}
            {layers.consistency && node.sharedConfig.consistency && (
                <Section title="Consistency">
                    <SelectField label="Replication" value={node.sharedConfig.consistency.replicationStrategy}
                        options={['leader-follower', 'multi-leader', 'leaderless']}
                        onChange={(v) => updateShared(node.id, { consistency: { ...node.sharedConfig.consistency!, replicationStrategy: v as any } })} />
                    <NumberField label="Factor" value={node.sharedConfig.consistency.replicationFactor} min={1} max={7}
                        onChange={(v) => updateShared(node.id, { consistency: { ...node.sharedConfig.consistency!, replicationFactor: v } })} />
                </Section>
            )}

            {/* Resilience */}
            {layers.resilience && node.sharedConfig.resilience && (
                <Section title="Resilience">
                    <Toggle label="Circuit Breaker" value={node.sharedConfig.resilience.circuitBreaker}
                        onChange={(v) => updateShared(node.id, { resilience: { ...node.sharedConfig.resilience!, circuitBreaker: v } })} />
                    <Toggle label="Auto Retries" value={node.sharedConfig.resilience.automaticRetries}
                        onChange={(v) => updateShared(node.id, { resilience: { ...node.sharedConfig.resilience!, automaticRetries: v } })} />
                </Section>
            )}

            {/* Traffic Control */}
            {layers.trafficControl && node.sharedConfig.trafficControl && (
                <Section title="Traffic Control">
                    <Toggle label="Rate Limiting" value={node.sharedConfig.trafficControl.rateLimiting}
                        onChange={(v) => updateShared(node.id, { trafficControl: { ...node.sharedConfig.trafficControl!, rateLimiting: v } })} />
                    {node.sharedConfig.trafficControl.rateLimiting && (
                        <>
                            <NumberField label="Limit (req/s)" value={node.sharedConfig.trafficControl.rateLimit || 1000} min={1} max={100000} step={100}
                                onChange={(v) => updateShared(node.id, { trafficControl: { ...node.sharedConfig.trafficControl!, rateLimit: v } })} />
                            <SelectField label="Strategy" value={node.sharedConfig.trafficControl.rateLimitStrategy || 'token-bucket'}
                                options={['token-bucket', 'sliding-window', 'fixed-window']}
                                onChange={(v) => updateShared(node.id, { trafficControl: { ...node.sharedConfig.trafficControl!, rateLimitStrategy: v as any } })} />
                        </>
                    )}
                </Section>
            )}

            {/* Load Balancer: backend weights when algorithm is weighted */}
            {node.type === 'load_balancer' && (node.specificConfig as { algorithm?: string }).algorithm === 'weighted' && (() => {
                const lbConfig = node.specificConfig as { backendWeights?: Record<string, number> };
                const backendConns = connections.filter((c) => c.sourceId === node.id);
                const weights = lbConfig.backendWeights ?? {};
                return (
                    <Section key="lb-weights" title="Backend Weights">
                        {backendConns.length === 0 ? (
                            <div style={{ fontSize: 11, color: '#64748b' }}>Connect to backends first</div>
                        ) : (
                            backendConns.map((conn) => {
                                const target = nodes.find((n) => n.id === conn.targetId);
                                const w = weights[conn.targetId] ?? 1;
                                return (
                                    <NumberField
                                        key={conn.targetId}
                                        label={target?.name ?? conn.targetId}
                                        value={w}
                                        min={1}
                                        max={100}
                                        onChange={(v) => updateSpecific(node.id, {
                                            backendWeights: { ...weights, [conn.targetId]: Math.max(1, v) },
                                        })}
                                    />
                                );
                            })
                        )}
                    </Section>
                );
            })()}

            {/* Component-specific config */}
            <Section title={`${catalog.label} Config`}>
                {Object.entries(
                    node.type === 'cache' && !('maxEntries' in node.specificConfig)
                        ? { ...node.specificConfig, maxEntries: 24 }
                        : node.specificConfig
                ).map(([key, value]) => {
                    if (key === 'backendWeights') return null;
                    if (typeof value === 'boolean') return <Toggle key={key} label={fmtLabel(key)} value={value} onChange={(v) => updateSpecific(node.id, { [key]: v })} />;
                    if (typeof value === 'number') {
                        if (node.type === 'cache' && key === 'maxEntries') {
                            return <NumberField key={key} label={fmtLabel(key)} value={value} min={1} max={1000} onChange={(v) => updateSpecific(node.id, { [key]: v })} />;
                        }
                        return <NumberField key={key} label={fmtLabel(key)} value={value} onChange={(v) => updateSpecific(node.id, { [key]: v })} />;
                    }
                    if (typeof value === 'string') {
                        const options = SPECIFIC_CONFIG_ENUMS[node.type]?.[key];
                        if (options) {
                            return (
                                <SelectField
                                    key={key}
                                    label={fmtLabel(key)}
                                    value={value}
                                    options={options}
                                    onChange={(v) => updateSpecific(node.id, { [key]: v })}
                                />
                            );
                        }
                        return <TextVal key={key} label={fmtLabel(key)} value={value} />;
                    }
                    return null;
                })}
            </Section>

            {/* Remove component */}
            <div style={{ padding: 12, marginTop: 'auto', borderTop: '1px solid #2a3244' }}>
                <button
                    type="button"
                    onClick={() => removeNode(node.id)}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#f87171',
                        background: 'rgba(248, 113, 113, 0.12)',
                        border: '1px solid rgba(248, 113, 113, 0.4)',
                        borderRadius: 6,
                        cursor: 'pointer',
                    }}
                >
                    Remove component
                </button>
            </div>
        </div>
    );
}

// ── UI Primitives ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ borderBottom: '1px solid #2a3244' }}>
            <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {title}
            </div>
            <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {children}
            </div>
        </div>
    );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                style={{ background: '#121826', border: '1px solid #2a3244', borderRadius: 4, color: '#e2e8f0', fontSize: 11, padding: '2px 6px', outline: 'none', maxWidth: 130 }}>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
            <input type="number" value={value} min={min} max={max} step={step || 1} onChange={(e) => onChange(Number(e.target.value))}
                style={{ background: '#121826', border: '1px solid #2a3244', borderRadius: 4, color: '#e2e8f0', fontSize: 11, padding: '2px 6px', outline: 'none', width: 70, textAlign: 'right' }} />
        </div>
    );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
            <button onClick={() => onChange(!value)}
                style={{ width: 32, height: 18, borderRadius: 9, border: 'none', background: value ? '#3b82f6' : '#2a3244', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 17 : 3, transition: 'left 0.2s' }} />
            </button>
        </div>
    );
}

function TextVal({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
            <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );
}

function fmtLabel(s: string): string {
    return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/Ttl/g, 'TTL').replace(/Rps/g, 'RPS');
}

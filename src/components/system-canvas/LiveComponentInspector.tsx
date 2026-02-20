/**
 * LiveComponentInspector — per-node live metrics when simulation is running.
 * Shown in the right panel when a node is selected during run/pause/completed.
 */
'use client';

import { useCanvasStore } from '@/stores/canvasStore';
import { useNodeDetailMetrics } from '@/stores/canvasSimulationStore';
import { getCatalogEntry } from '@/lib/data/componentCatalog';
import type { ComponentDetailData } from '@/lib/simulation/types';

const font = 'Inter, system-ui, sans-serif';
const panelWidth = 280;

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

function Row({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span style={{ color: '#94a3b8' }}>{label}</span>
            <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );
}

function UtilizationBar({ value, label }: { value: number; label?: string }) {
    const pct = Math.min(100, Math.max(0, value * 100));
    return (
        <div>
            {label && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{label}</div>}
            <div style={{ height: 8, background: '#2a3244', borderRadius: 4, overflow: 'hidden' }}>
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: pct > 90 ? '#f87171' : pct > 70 ? '#f59e0b' : '#22c55e',
                        transition: 'width 0.2s',
                    }}
                />
            </div>
        </div>
    );
}

// ── Per-type detail panels ──

function CacheDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'cache' }> }) {
    return (
        <>
            <Section title="Config">
                <Row label="Read strategy" value={d.readStrategy} />
                <Row label="Write strategy" value={d.writeStrategy} />
                <Row label="Eviction" value={d.evictionPolicy} />
                <Row label="TTL (s)" value={d.ttl} />
            </Section>
            <Section title="Hit / Miss">
                <Row label="Hits" value={Math.round(d.hits)} />
                <Row label="Misses" value={Math.round(d.misses)} />
                <Row label="Hit rate" value={`${(d.hitRate * 100).toFixed(1)}%`} />
                <UtilizationBar value={d.hitRate} label="Hit rate" />
            </Section>
            <Section title="Cache entries">
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                    {d.entries.length} / {d.maxEntries} (next evict marked)
                </div>
                {d.entries.slice(0, 12).map((e) => (
                    <div
                        key={e.key}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 10,
                            padding: '4px 6px',
                            background: e.willEvict ? 'rgba(248, 113, 113, 0.15)' : '#1e293b',
                            borderRadius: 4,
                            borderLeft: e.willEvict ? '3px solid #f87171' : '3px solid transparent',
                        }}
                    >
                        <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{e.key}</span>
                        <span style={{ color: '#94a3b8' }}>age {e.age} · {e.accessCount} acc</span>
                    </div>
                ))}
                {d.entries.length > 12 && (
                    <div style={{ fontSize: 10, color: '#64748b' }}>+{d.entries.length - 12} more</div>
                )}
            </Section>
        </>
    );
}

function CDNDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'cdn' }> }) {
    return (
        <>
            <Section title="Config">
                <Row label="Edge locations" value={d.edgeLocations} />
                <Row label="TTL (s)" value={d.ttl} />
            </Section>
            <Section title="Hit / Miss">
                <Row label="Hits" value={Math.round(d.hits)} />
                <Row label="Misses" value={Math.round(d.misses)} />
                <Row label="Hit rate" value={`${(d.hitRate * 100).toFixed(1)}%`} />
            </Section>
        </>
    );
}

function LoadBalancerDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'load_balancer' }> }) {
    return (
        <>
            <Section title="Config">
                <Row label="Algorithm" value={d.algorithm} />
            </Section>
            <Section title="Backends">
                {d.backends.map((b) => (
                    <div key={b.nodeId} style={{ padding: '6px 0', borderBottom: '1px solid #2a3244' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>{b.name}</div>
                        <Row label="Sent requests" value={b.sentRequests} />
                        <Row label="Active connections" value={b.activeConnections} />
                    </div>
                ))}
            </Section>
        </>
    );
}

function AppServerDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'app_server' }> }) {
    return (
        <Section title="Config">
            <Row label="Instance type" value={d.instanceType} />
            <Row label="Active instances" value={d.activeInstances} />
            <Row label="Max instances" value={d.maxInstances} />
            <Row label="Auto-scaling" value={d.autoScaling ? 'On' : 'Off'} />
        </Section>
    );
}

function DatabaseSQLDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'database_sql' }> }) {
    return (
        <>
            <Section title="Config">
                <Row label="Engine" value={d.engine} />
                <Row label="Read capacity" value={d.readCapacity} />
                <Row label="Write capacity" value={d.writeCapacity} />
                <Row label="Read replicas" value={d.readReplicas} />
                <Row label="Connection pooling" value={d.connectionPooling ? 'On' : 'Off'} />
            </Section>
            <Section title="Live">
                <Row label="Active connections" value={d.activeConnections} />
            </Section>
        </>
    );
}

function DatabaseNoSQLDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'database_nosql' }> }) {
    return (
        <Section title="Config">
            <Row label="Engine" value={d.engine} />
            <Row label="Consistency" value={d.consistencyLevel} />
            <Row label="Capacity" value={d.capacity} />
            <Row label="Utilization" value={`${(d.utilization * 100).toFixed(1)}%`} />
        </Section>
    );
}

function MessageQueueDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'message_queue' }> }) {
    return (
        <>
            <Section title="Config">
                <Row label="Partitions" value={d.partitions} />
                <Row label="FIFO" value={d.isFifo ? 'Yes' : 'No'} />
            </Section>
            <Section title="Queue state">
                <Row label="Enqueued" value={d.enqueued} />
                <Row label="Processed" value={d.processed} />
                <Row label="Queue depth" value={d.queueDepth} />
                <Row label="Dead-lettered" value={d.deadLettered} />
                <UtilizationBar value={d.enqueued > 0 ? d.queueDepth / Math.max(d.enqueued, 1) : 0} label="Depth ratio" />
            </Section>
        </>
    );
}

function ObjectStoreDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'object_store' }> }) {
    return (
        <Section title="Config">
            <Row label="Storage class" value={d.storageClass} />
            <Row label="Capacity" value={d.capacity} />
            <Row label="Utilization" value={`${(d.utilization * 100).toFixed(1)}%`} />
        </Section>
    );
}

function APIGatewayDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'api_gateway' }> }) {
    return (
        <>
            <Section title="Config">
                <Row label="Auth" value={d.authEnabled ? 'On' : 'Off'} />
                <Row label="Rate limiting" value={d.rateLimiting ? 'On' : 'Off'} />
                {d.rateLimiting && <Row label="Limit (req/s)" value={d.rateLimit} />}
            </Section>
            <Section title="Live">
                <Row label="Allowed" value={d.allowed} />
                <Row label="Dropped" value={d.dropped} />
            </Section>
        </>
    );
}

function ClientDetail({ d }: { d: Extract<ComponentDetailData, { kind: 'client' }> }) {
    return (
        <Section title="Config">
            <Row label="Requests/sec" value={Math.round(d.requestsPerSecond)} />
        </Section>
    );
}

// ── Main component ──

interface LiveComponentInspectorProps {
    nodeId: string;
}

export default function LiveComponentInspector({ nodeId }: LiveComponentInspectorProps) {
    const nodes = useCanvasStore((s) => s.nodes);
    const clearSelection = useCanvasStore((s) => s.clearSelection);
    const detail = useNodeDetailMetrics(nodeId);
    const node = nodes.find((n) => n.id === nodeId);

    if (!node) return null;
    const catalog = getCatalogEntry(node.type);
    if (!catalog) return null;

    return (
        <div
            style={{
                width: panelWidth,
                minWidth: panelWidth,
                flexShrink: 0,
                height: '100%',
                background: '#181e2e',
                borderLeft: '1px solid #2a3244',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: font,
                overflowY: 'auto',
            }}
        >
            {/* Header */}
            <div style={{ padding: 12, borderBottom: '1px solid #2a3244' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 22 }}>{catalog.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{node.name}</span>
                    {detail && (
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: detail.isHealthy ? '#22c55e' : '#f87171',
                            }}
                            title={detail.isHealthy ? 'Healthy' : 'Unhealthy'}
                        />
                    )}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', paddingLeft: 30 }}>{catalog.label}</div>
                <button
                    type="button"
                    onClick={clearSelection}
                    style={{
                        marginTop: 10,
                        padding: '6px 12px',
                        fontSize: 11,
                        color: '#94a3b8',
                        background: '#2a3244',
                        border: '1px solid #475569',
                        borderRadius: 6,
                        cursor: 'pointer',
                    }}
                >
                    Back to results
                </button>
            </div>

            {/* Common metrics */}
            {detail && (
                <Section title="Live metrics">
                    <Row label="RPS" value={Math.round(detail.currentRps)} />
                    <Row label="Latency (ms)" value={detail.avgLatencyMs} />
                    <Row label="Error rate" value={`${(detail.avgErrorRate * 100).toFixed(2)}%`} />
                    <Row label="Capacity" value={detail.capacity} />
                    <UtilizationBar value={detail.utilization} label="Utilization" />
                </Section>
            )}

            {/* Type-specific detail */}
            {detail?.componentDetail && (
                <>
                    {detail.componentDetail.kind === 'cache' && <CacheDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'cdn' && <CDNDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'load_balancer' && <LoadBalancerDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'app_server' && <AppServerDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'database_sql' && <DatabaseSQLDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'database_nosql' && <DatabaseNoSQLDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'message_queue' && <MessageQueueDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'object_store' && <ObjectStoreDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'api_gateway' && <APIGatewayDetail d={detail.componentDetail} />}
                    {detail.componentDetail.kind === 'client' && <ClientDetail d={detail.componentDetail} />}
                </>
            )}

            {detail && !detail.componentDetail && (
                <Section title="Metrics">
                    <Row label="No type-specific data" value="—" />
                </Section>
            )}
        </div>
    );
}

/**
 * DBInternals — read/write bar, query distribution, metrics, slow-query warning.
 */
'use client';

import type { ComponentDetailData } from '@/lib/simulation/types';
import type { NodeDetailMetrics } from '@/lib/simulation/types';

interface DBInternalsProps {
    nodeId: string;
    detail: (Extract<ComponentDetailData, { kind: 'database_sql' }> | Extract<ComponentDetailData, { kind: 'database_nosql' }>) | undefined;
    simState?: NodeDetailMetrics;
}

export default function DBInternals({ nodeId, detail, simState }: DBInternalsProps) {
    if (!detail) return <div style={{ color: '#64748b', fontSize: 11 }}>—</div>;
    const readCap = 'readCapacity' in detail ? detail.readCapacity : 0;
    const writeCap = 'writeCapacity' in detail ? detail.writeCapacity : 0;
    const total = readCap + writeCap || 1;
    const readPct = (readCap / total) * 100;
    const queryDist = detail.queryDistribution ?? [];
    const topQueries = queryDist.slice(0, 5);
    const maxQ = Math.max(1, ...topQueries.map((q) => q.count));
    const avgLat = simState?.avgLatencyMs;
    const connections = 'activeConnections' in detail ? detail.activeConnections : 0;
    const replicas = 'readReplicas' in detail ? (detail as { readReplicas?: number }).readReplicas : undefined;
    const replLag = 'replicationLagMs' in detail && detail.instances != null && detail.instances > 1 ? (detail as { replicationLagMs?: number }).replicationLagMs : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Read / Write</div>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', width: 288 }}>
                    <div style={{ width: `${readPct}%`, background: '#3b82f6', height: 10 }} />
                    <div style={{ width: `${100 - readPct}%`, background: '#f59e0b', height: 10 }} />
                </div>
            </div>
            {topQueries.length > 0 && (
                <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Query distribution</div>
                    {topQueries.map((q, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{q.query}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                <div style={{ width: 180, height: 6, background: '#2a3244', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${(q.count / maxQ) * 100}%`, height: 6, background: '#10b981', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{q.count}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10 }}>
                <div><span style={{ color: '#64748b' }}>AVG LATENCY</span><div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{avgLat != null ? `${Math.round(avgLat)}ms` : '—'}</div></div>
                <div><span style={{ color: '#64748b' }}>CONNECTIONS</span><div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{connections}</div></div>
                <div><span style={{ color: '#64748b' }}>REPLICATION</span><div style={{ color: '#e2e8f0' }}>{replicas != null && replicas > 0 ? `${replicas} replicas` : '—'}{replLag != null ? ` · ${Math.round(replLag)}ms lag` : ''}</div></div>
            </div>
            {avgLat != null && avgLat > 100 && (
                <div style={{ padding: '8px 10px', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', borderRadius: 6, fontSize: 11, borderLeft: '3px solid #ef4444' }}>
                    ⚠ Queries exceeding 100ms — consider adding an index
                </div>
            )}
        </div>
    );
}

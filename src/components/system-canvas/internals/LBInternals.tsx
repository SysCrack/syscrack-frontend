/**
 * LBInternals — algorithm chip, backend table (instances from nodes), health check.
 */
'use client';

import type { CanvasNode } from '@/lib/types/canvas';
import type { ComponentDetailData } from '@/lib/simulation/types';

interface LBInternalsProps {
    nodeId: string;
    detail: Extract<ComponentDetailData, { kind: 'load_balancer' }> | undefined;
    node: CanvasNode;
    nodes: CanvasNode[];
}

export default function LBInternals({ nodeId, detail, node, nodes }: LBInternalsProps) {
    if (!detail) return <div style={{ color: '#64748b', fontSize: 11 }}>—</div>;
    const healthCheck = node.sharedConfig?.resilience?.healthCheck;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <span
                    style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        background: 'rgba(139, 92, 246, 0.15)',
                        border: '1px solid rgba(139, 92, 246, 0.4)',
                        borderRadius: 6,
                        color: '#a78bfa',
                    }}
                >
                    {detail.algorithm ?? 'ROUND ROBIN'}
                </span>
            </div>
            <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Backends</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detail.backends.map((b) => {
                        const backendNode = nodes.find((n) => n.id === b.nodeId);
                        const instances = backendNode?.sharedConfig?.scaling?.instances ?? 1;
                        return (
                            <div key={b.nodeId} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', fontSize: 10, padding: '6px 8px', background: '#1e293b', borderRadius: 6 }}>
                                <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{b.name}</span>
                                <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{Math.round(b.sentRequests)}/s</span>
                                <span style={{ color: '#22c55e' }}>● OK</span>
                                <span style={{ color: '#64748b' }}>×{instances}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {healthCheck && (
                <div style={{ fontSize: 10, color: '#64748b' }}>
                    Health check: interval {healthCheck.intervalSeconds ?? '—'}s
                    {healthCheck.failoverDelayMs != null && ` · failover ${healthCheck.failoverDelayMs}ms`}
                </div>
            )}
        </div>
    );
}

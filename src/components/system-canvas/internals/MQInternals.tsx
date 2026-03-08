/**
 * MQInternals — queue depth bar, metrics row (throughput = simState.currentRps), sparkline.
 */
'use client';

import { useEffect, useState } from 'react';
import type { ComponentDetailData } from '@/lib/simulation/types';
import type { NodeDetailMetrics } from '@/lib/simulation/types';
import Sparkline from './Sparkline';

interface MQInternalsProps {
    nodeId: string;
    detail: Extract<ComponentDetailData, { kind: 'message_queue' }> | undefined;
    simState?: NodeDetailMetrics;
}

export default function MQInternals({ nodeId, detail, simState }: MQInternalsProps) {
    const [depthHistory, setDepthHistory] = useState<number[]>([]);

    useEffect(() => {
        setDepthHistory([]);
    }, [nodeId]);

    useEffect(() => {
        if (detail?.queueDepth == null) return;
        setDepthHistory((prev) => {
            const next = [...prev, detail.queueDepth];
            return next.length > 60 ? next.slice(-60) : next;
        });
    }, [detail?.queueDepth]);

    if (!detail) return <div style={{ color: '#64748b', fontSize: 11 }}>—</div>;
    const maxDepth = Math.max(detail.queueDepth, detail.enqueued, 1);
    const depthPct = maxDepth > 0 ? detail.queueDepth / maxDepth : 0;
    const barColor = depthPct < 0.5 ? '#22c55e' : depthPct < 0.8 ? '#f59e0b' : '#ef4444';
    const throughput = (simState as NodeDetailMetrics)?.currentRps ?? 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Queue depth</div>
                <div style={{ height: 10, background: '#2a3244', borderRadius: 5, overflow: 'hidden', width: 288 }}>
                    <div style={{ width: `${Math.min(100, depthPct * 100)}%`, height: 10, background: barColor, borderRadius: 5 }} />
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{Math.round(detail.queueDepth)} / {Math.round(maxDepth)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10 }}>
                <div><span style={{ color: '#64748b' }}>DEPTH</span><div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{Math.round(detail.queueDepth)}</div></div>
                <div><span style={{ color: '#64748b' }}>THROUGHPUT</span><div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{Math.round(throughput)}/s</div></div>
                <div><span style={{ color: '#64748b' }}>DELIVERY</span><div style={{ color: '#e2e8f0' }}>{detail.deliveryGuarantee ?? '—'}</div></div>
            </div>
            {depthHistory.length >= 2 && (
                <div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Depth over time</div>
                    <Sparkline data={depthHistory} width={288} height={48} color="#f59e0b" gradientId={`spark-${nodeId}`} />
                </div>
            )}
        </div>
    );
}

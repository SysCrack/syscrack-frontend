/**
 * GenericInternals — simple 2×2 grid: RPS, AVG LATENCY, ERROR RATE, CPU.
 */
'use client';

import type { NodeDetailMetrics } from '@/lib/simulation/types';

interface GenericInternalsProps {
    simState?: NodeDetailMetrics;
}

export default function GenericInternals({ simState }: GenericInternalsProps) {
    if (!simState) return <div style={{ color: '#64748b', fontSize: 11 }}>—</div>;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11 }}>
            <div><span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>RPS</span><span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{Math.round((simState as NodeDetailMetrics).currentRps ?? 0)}</span></div>
            <div><span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>AVG LATENCY</span><span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{simState.avgLatencyMs != null ? `${Math.round(simState.avgLatencyMs)}ms` : '—'}</span></div>
            <div><span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>ERROR RATE</span><span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{((simState.avgErrorRate ?? 0) * 100).toFixed(2)}%</span></div>
            <div><span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>CPU</span><span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{Math.round(simState.avgCpuPercent ?? 0)}%</span></div>
        </div>
    );
}

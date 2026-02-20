/**
 * SimulationResults — results panel showing diagnostics and bottlenecks.
 * Shows per-scenario diagnostics + structural SPOF warnings.
 */
'use client';

import { useMemo } from 'react';
import { useCanvasSimulationStore, useCurrentResult } from '@/stores/canvasSimulationStore';
import { useCanvasStore } from '@/stores/canvasStore';
import type { SimulationDiagnostic } from '@/lib/simulation/types';

const font = 'Inter, system-ui, sans-serif';

export default function SimulationResults() {
    const status = useCanvasSimulationStore((s) => s.status);
    const output = useCanvasSimulationStore((s) => s.output);
    const result = useCurrentResult();
    const { nodes, connections } = useCanvasStore();

    if (status === 'idle' || status === 'error' || !output || !result) return null;

    // Recalculate SPOF diagnostics from CURRENT node state (not just stored output)
    // This ensures diagnostics update immediately when instances are changed
    const currentSpofDiagnostics = useMemo<SimulationDiagnostic[]>(() => {
        const spofs: SimulationDiagnostic[] = [];
        for (const node of nodes) {
            if (node.type === 'client') continue;
            const instances = node.sharedConfig.scaling?.instances ?? 1;
            const hasSuccessors = connections.some((c) => c.sourceId === node.id);
            const hasPredecessors = connections.some((c) => c.targetId === node.id);
            
            if (instances <= 1 && (hasSuccessors || hasPredecessors)) {
                spofs.push({
                    componentId: node.id,
                    componentName: node.name,
                    severity: 'warning',
                    eventType: 'spof',
                    message: `⚠ ${node.name} is a single point of failure (1 instance)`,
                    suggestion: 'Increase instances or enable auto-scaling for redundancy',
                });
            }
        }
        return spofs;
    }, [nodes, connections]);

    const allDiagnostics = [
        ...result.diagnostics,            // per-scenario (overloaded, high_utilization)
        ...currentSpofDiagnostics,        // structural (SPOF) - recalculated from current state
    ];

    return (
        <div
            style={{
                width: 280,
                minWidth: 280,
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
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #2a3244' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    📊 Simulation Results
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {result.scenario} — Score: {result.score}%
                </div>
            </div>

            {/* Score breakdown */}
            <Section title="Performance">
                <MetricRow label="Throughput" value={`${Math.round(result.metrics.requestsPerSecond).toLocaleString()} RPS`} />
                <MetricRow label="Avg Latency" value={`${result.metrics.avgLatencyMs.toFixed(1)} ms`} />
                <MetricRow label="P50" value={`${result.metrics.p50LatencyMs.toFixed(1)} ms`} />
                <MetricRow label="P95" value={`${result.metrics.p95LatencyMs.toFixed(1)} ms`} />
                <MetricRow label="P99" value={`${result.metrics.p99LatencyMs.toFixed(1)} ms`} />
                <MetricRow label="Response Time" value={`${result.metrics.responseTimeMs.toFixed(1)} ms`} />
                <MetricRow label="TTFB" value={`${result.metrics.ttfbMs.toFixed(1)} ms`} />
            </Section>

            <Section title="Reliability">
                <MetricRow
                    label="Error Rate"
                    value={`${(result.metrics.errorRate * 100).toFixed(3)}%`}
                    warn={result.metrics.errorRate > 0.01}
                />
                <MetricRow label="Status" value={result.passed ? '✅ Passed' : '❌ Failed'} />
            </Section>

            <Section title="Cost">
                <MetricRow label="Monthly Est." value={`$${result.metrics.estimatedCostMonthly.toLocaleString()}`} />
            </Section>

            {/* Bottlenecks */}
            {result.metrics.bottlenecks.length > 0 && (
                <Section title="Bottlenecks">
                    {result.metrics.bottlenecks.map((b) => (
                        <div key={b} style={{ fontSize: 11, color: '#f87171', padding: '3px 0' }}>
                            🔴 {b}
                        </div>
                    ))}
                </Section>
            )}

            {/* Diagnostics — per-scenario + SPOF */}
            {allDiagnostics.length > 0 && (
                <Section title="Diagnostics">
                    {allDiagnostics.map((d, i) => (
                        <div
                            key={`${d.componentId}-${d.eventType}-${i}`}
                            style={{
                                fontSize: 11,
                                padding: '6px 0',
                                borderBottom: i < allDiagnostics.length - 1 ? '1px solid #1e293b' : 'none',
                            }}
                        >
                            <div style={{ color: d.severity === 'critical' ? '#f87171' : d.severity === 'warning' ? '#facc15' : '#94a3b8' }}>
                                {d.message}
                            </div>
                            <div style={{ color: '#64748b', marginTop: 2, fontSize: 10 }}>
                                💡 {d.suggestion}
                            </div>
                        </div>
                    ))}
                </Section>
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ borderBottom: '1px solid #2a3244' }}>
            <div style={{
                padding: '8px 14px',
                fontSize: 10,
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
            }}>
                {title}
            </div>
            <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {children}
            </div>
        </div>
    );
}

function MetricRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: warn ? '#f87171' : '#e2e8f0', fontFamily: 'monospace' }}>
                {value}
            </span>
        </div>
    );
}

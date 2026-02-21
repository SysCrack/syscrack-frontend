/**
 * SimulationBar — top metrics bar shown during/after simulation.
 * Excalidraw-inspired dark theme.
 */
'use client';

import { useCanvasSimulationStore, useCurrentResult } from '@/stores/canvasSimulationStore';

const font = 'Inter, system-ui, sans-serif';

export default function SimulationBar() {
    const status = useCanvasSimulationStore((s) => s.status);
    const output = useCanvasSimulationStore((s) => s.output);
    const selectedScenario = useCanvasSimulationStore((s) => s.selectedScenario);
    const error = useCanvasSimulationStore((s) => s.error);
    const { runSimulation, reset, selectScenario } = useCanvasSimulationStore.getState();
    const result = useCurrentResult();

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(18, 24, 38, 0.92)',
                border: '1px solid #2a3244',
                borderRadius: 10,
                padding: '6px 14px',
                backdropFilter: 'blur(10px)',
                fontFamily: font,
                flexWrap: 'wrap',
            }}
        >
            {/* Play / Stop button */}
            {status === 'idle' || status === 'error' ? (
                <button onClick={runSimulation} style={btnStyle('#3b82f6')}>
                    ▶ Simulate
                </button>
            ) : status === 'running' ? (
                <span style={{ fontSize: 12, color: '#facc15', fontWeight: 600 }}>
                    ⏳ Running…
                </span>
            ) : (
                <button onClick={reset} style={btnStyle('#64748b')}>
                    ↺ Reset
                </button>
            )}

            {/* Error */}
            {error && (
                <span style={{ fontSize: 11, color: '#f87171' }}>{error}</span>
            )}

            {/* Scenario tabs */}
            {output && output.results.length > 1 && (
                <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                    {output.results.map((r, i) => (
                        <button
                            key={r.scenario}
                            onClick={() => selectScenario(i)}
                            style={{
                                ...tabStyle,
                                background: i === selectedScenario ? '#1e293b' : 'transparent',
                                color: i === selectedScenario ? '#e2e8f0' : '#64748b',
                                borderColor: i === selectedScenario ? '#3b82f6' : 'transparent',
                            }}
                        >
                            {r.scenario}
                        </button>
                    ))}
                </div>
            )}

            {/* Metrics */}
            {result && (
                <>
                    <Metric label="RPS" value={Math.round(result.metrics.requestsPerSecond).toLocaleString()} color="#3b82f6" />
                    <Metric label="Avg" value={`${result.metrics.avgLatencyMs.toFixed(1)}ms`} color="#a78bfa" />
                    <Metric label="P99" value={`${result.metrics.p99LatencyMs.toFixed(1)}ms`} color="#f59e0b" />
                    <Metric label="Err" value={`${(result.metrics.errorRate * 100).toFixed(2)}%`} color={result.metrics.errorRate > 0.01 ? '#f87171' : '#22c55e'} />
                    <Metric label="Cost" value={`$${result.metrics.estimatedCostMonthly}/mo`} color="#64748b" />
                    <ScoreBadge score={result.score} passed={result.passed} />
                </>
            )}
        </div>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginLeft: 6 }}>
            <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: font }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: font }}>{value}</span>
        </div>
    );
}

function ScoreBadge({ score, passed }: { score: number; passed: boolean }) {
    const bg = passed ? '#16a34a' : score > 40 ? '#f59e0b' : '#dc2626';
    return (
        <div
            style={{
                marginLeft: 8,
                padding: '2px 10px',
                borderRadius: 6,
                background: bg,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: font,
            }}
        >
            {score}%
        </div>
    );
}

function btnStyle(bg: string): React.CSSProperties {
    return {
        background: bg,
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        padding: '5px 14px',
        cursor: 'pointer',
        fontFamily: font,
    };
}

const tabStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 5,
    color: '#64748b',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    cursor: 'pointer',
    fontFamily: font,
};

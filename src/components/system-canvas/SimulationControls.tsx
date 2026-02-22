/**
 * SimulationControls — top bar with play/pause, speed/load sliders, live metrics.
 * Replaces the old SimulationBar.
 */
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCanvasSimulationStore, useCurrentResult } from '@/stores/canvasSimulationStore';
import { getTopologyWarnings } from '@/lib/connectionRules';
import type { RequestMethod, PayloadSize } from '@/lib/simulation/types';

const font = 'Inter, system-ui, sans-serif';

export default function SimulationControls() {
    const status = useCanvasSimulationStore((s) => s.status);
    const error = useCanvasSimulationStore((s) => s.error);
    const speed = useCanvasSimulationStore((s) => s.speed);
    const loadFactor = useCanvasSimulationStore((s) => s.loadFactor);
    const liveMetrics = useCanvasSimulationStore((s) => s.liveMetrics);
    const output = useCanvasSimulationStore((s) => s.output);
    const selectedScenario = useCanvasSimulationStore((s) => s.selectedScenario);
    const result = useCurrentResult();

    const {
        runSimulation,
        startDebugMode,
        pauseSimulation,
        resumeSimulation,
        stepSimulation,
        injectRequest,
        injectSequential,
        reset,
        selectScenario,
        setSpeed,
        setLoadFactor,
        setParticleFilter,
    } = useCanvasSimulationStore.getState();
    const particleFilter = useCanvasSimulationStore((s) => s.particleFilter);

    const isLive = status === 'running' || status === 'paused';
    const [injectCount, setInjectCount] = useState(1);
    const [injectMethod, setInjectMethod] = useState<RequestMethod>('GET');
    const [injectPayload, setInjectPayload] = useState<PayloadSize>('small');
    const [injectPath, setInjectPath] = useState('');

    // Use live metrics when running, static metrics when viewing results
    const rps = isLive
        ? (liveMetrics?.rps ?? 0)
        : (result?.metrics.requestsPerSecond ?? 0);
    const avgLat = isLive
        ? (liveMetrics?.avgLatencyMs ?? 0)
        : (result?.metrics.avgLatencyMs ?? 0);
    const errRate = isLive
        ? (liveMetrics?.errorRate ?? 0)
        : (result?.metrics.errorRate ?? 0);
    const cost = isLive
        ? (liveMetrics?.estimatedCostMonthly ?? 0)
        : (result?.metrics.estimatedCostMonthly ?? 0);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(18, 24, 38, 0.92)',
                border: '1px solid #2a3244',
                borderRadius: 10,
                padding: '5px 12px',
                backdropFilter: 'blur(10px)',
                fontFamily: font,
                flexWrap: 'wrap',
            }}
        >
            {/* Play / Pause / Reset */}
            {status === 'idle' || status === 'error' ? (
                <>
                    <button onClick={runSimulation} style={btnStyle('#3b82f6')}>
                        ▶ Simulate
                    </button>
                    <button onClick={startDebugMode} style={btnStyle('#8b5cf6')} title="Initialize without running — step through one request at a time">
                        🔬 Debug
                    </button>
                </>
            
            ) : status === 'running' ? (
                <button onClick={pauseSimulation} style={btnStyle('#f59e0b')}>
                    ⏸ Pause
                </button>
            ) : status === 'paused' ? (
                <>
                    <button onClick={stepSimulation} style={btnStyle('#8b5cf6')} title="Advance one frame">
                        Step
                    </button>
                    <select
                        value={injectCount}
                        onChange={(e) => setInjectCount(Number(e.target.value))}
                        style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            color: '#e2e8f0',
                            fontSize: 11,
                            padding: '4px 6px',
                        }}
                    >
                        {[1, 5, 10, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                    <select
                        value={injectMethod}
                        onChange={(e) => setInjectMethod(e.target.value as RequestMethod)}
                        style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            color: injectMethod === 'GET' ? '#3b82f6' : '#f97316',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 6px',
                        }}
                        title="Request method (GET = read, POST/PUT/DELETE = write)"
                    >
                        {(['GET', 'POST', 'PUT', 'DELETE'] as RequestMethod[]).map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                    <select
                        value={injectPayload}
                        onChange={(e) => setInjectPayload(e.target.value as PayloadSize)}
                        style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            color: '#e2e8f0',
                            fontSize: 11,
                            padding: '4px 6px',
                        }}
                        title="Payload size (affects latency)"
                    >
                        {(['tiny', 'small', 'medium', 'large'] as PayloadSize[]).map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={injectPath}
                        onChange={(e) => setInjectPath(e.target.value)}
                        placeholder="/users/1"
                        style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            color: '#e2e8f0',
                            fontSize: 11,
                            padding: '4px 8px',
                            width: 72,
                            fontFamily: 'monospace',
                        }}
                        title="Request path (optional, shown in trace)"
                    />
                    <button onClick={() => injectRequest(injectCount, injectMethod, injectPayload, injectPath || undefined)} style={btnStyle('#06b6d4')} title="Inject N requests at first client (burst)">
                        Inject
                    </button>
                    <button onClick={() => injectSequential(injectCount, injectMethod, injectPayload, injectPath || undefined)} style={btnStyle('#0891b2')} title="Inject N requests spaced out, each follows behind the previous">
                        Inject Seq
                    </button>
                    <button onClick={resumeSimulation} style={btnStyle('#22c55e')}>
                        ▶ Resume
                    </button>
                </>
            ) : (
                <button onClick={reset} style={btnStyle('#64748b')}>
                    ↺ Reset
                </button>
            )}

            {isLive && (
                <button onClick={reset} style={btnStyle('#475569')} title="Reset">
                    ⏹
                </button>
            )}

            {error && (
                <span style={{ fontSize: 11, color: '#f87171' }}>{error}</span>
            )}

            {/* Speed slider */}
            {isLive && (
                <div style={sliderGroup}>
                    <span style={sliderLabel}>Speed</span>
                    <input
                        type="range"
                        min={0.25}
                        max={4}
                        step={0.25}
                        value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        style={sliderStyle}
                    />
                    <span style={sliderValue}>{speed}x</span>
                </div>
            )}

            {/* Load slider */}
            {isLive && (
                <div style={sliderGroup}>
                    <span style={sliderLabel}>Load</span>
                    <input
                        type="range"
                        min={0.5}
                        max={5}
                        step={0.5}
                        value={loadFactor}
                        onChange={(e) => setLoadFactor(parseFloat(e.target.value))}
                        style={sliderStyle}
                    />
                    <span style={sliderValue}>{loadFactor}x</span>
                </div>
            )}

            {/* Particle filter: All / Reads / Writes */}
            {isLive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
                    {(['all', 'reads', 'writes'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setParticleFilter(f)}
                            style={{
                                background: particleFilter === f ? '#1e293b' : 'transparent',
                                border: `1px solid ${particleFilter === f ? '#3b82f6' : '#334155'}`,
                                borderRadius: 4,
                                color: particleFilter === f ? '#e2e8f0' : '#64748b',
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '3px 8px',
                                cursor: 'pointer',
                                fontFamily: font,
                                textTransform: 'capitalize',
                            }}
                            title={f === 'all' ? 'Show all particles' : f === 'reads' ? 'Show read particles only' : 'Show write particles only'}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {/* Scenario tabs — only when idle with results (for viewing static) */}
            {status === 'completed' && output && output.results.length > 1 && (
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

            {/* Divider */}
            {(isLive || result) && (
                <div style={{ width: 1, height: 18, background: '#2a3244', margin: '0 2px' }} />
            )}

            {/* Live metrics */}
            {(isLive || result) && (
                <>
                    <Metric label="RPS" value={Math.round(rps).toLocaleString()} color="#3b82f6" />
                    <Metric label="Avg" value={`${avgLat.toFixed(1)}ms`} color="#a78bfa" />
                    <Metric
                        label="Err"
                        value={`${(errRate * 100).toFixed(2)}%`}
                        color={errRate > 0.01 ? '#f87171' : '#22c55e'}
                    />
                    <Metric label="Cost" value={`$${cost}/mo`} color="#64748b" />
                </>
            )}

            {/* Live indicator */}
            {status === 'running' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
                        animation: 'pulse 1s infinite',
                    }} />
                    <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 600 }}>LIVE</span>
                </div>
            )}
        </div>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginLeft: 4 }}>
            <span style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: font }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
        </div>
    );
}

function btnStyle(bg: string): React.CSSProperties {
    return {
        background: bg,
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 12px',
        cursor: 'pointer',
        fontFamily: font,
    };
}

const sliderGroup: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginLeft: 2,
};

const sliderLabel: React.CSSProperties = {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: font,
};

const sliderValue: React.CSSProperties = {
    fontSize: 10,
    color: '#e2e8f0',
    fontWeight: 600,
    fontFamily: 'monospace',
    minWidth: 26,
    textAlign: 'right',
};

const sliderStyle: React.CSSProperties = {
    width: 60,
    height: 4,
    accentColor: '#3b82f6',
    cursor: 'pointer',
};

const tabStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 5,
    color: '#64748b',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: font,
};

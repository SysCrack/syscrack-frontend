/**
 * /sandbox — Free-form system design canvas.
 *
 * Three-panel layout:
 *   Left:   ComponentPalette (drag to canvas)
 *   Center: SystemCanvas (react-konva) + SimulationBar (top-right)
 *   Right:  ConfigSidebar (when component selected) OR SimulationResults (after simulation)
 *
 * Only Konva-dependent components use dynamic import (ssr: false).
 * Pure-HTML components import normally so Zustand subscriptions work.
 */
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ConfigSidebar from '@/components/system-canvas/ConfigSidebar';
import LiveComponentInspector from '@/components/system-canvas/LiveComponentInspector';
import RequestTracePanel from '@/components/system-canvas/RequestTracePanel';
import SimulationControls from '@/components/system-canvas/SimulationControls';
import SimulationResults from '@/components/system-canvas/SimulationResults';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';

// Only Konva components need dynamic import (they access `window`)
const SystemCanvas = dynamic(
    () => import('@/components/system-canvas/SystemCanvas'),
    { ssr: false },
);
const ComponentPalette = dynamic(
    () => import('@/components/system-canvas/ComponentPalette'),
    { ssr: false },
);

function SandboxTitleBar() {
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const selectedConnectionId = useCanvasStore((s) => s.selectedConnectionId);
    const deleteSelected = useCanvasStore((s) => s.deleteSelected);
    const hasSelection = selectedNodeIds.length > 0 || selectedConnectionId !== null;

    return (
        <div
            style={{
                position: 'absolute',
                top: 12,
                left: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(18, 24, 38, 0.85)',
                border: '1px solid #2a3244',
                borderRadius: 8,
                padding: '6px 14px',
                backdropFilter: 'blur(8px)',
                pointerEvents: 'auto',
            }}
        >
            <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
                🧪 Sandbox
            </span>
            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif' }}>
                Drag components • Click ports to connect • Configure
            </span>
            {hasSelection && (
                <button
                    type="button"
                    onClick={deleteSelected}
                    title="Delete selected (Del)"
                    style={{
                        marginLeft: 8,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#f87171',
                        background: 'rgba(248, 113, 113, 0.15)',
                        border: '1px solid rgba(248, 113, 113, 0.4)',
                        borderRadius: 6,
                        cursor: 'pointer',
                    }}
                >
                    Delete
                </button>
            )}
        </div>
    );
}

/**
 * Right panel logic:
 * - If simulation active AND one node selected → LiveComponentInspector (metrics win over traces)
 * - If traceHistory has traces (step-through debug) → RequestTracePanel (collapsible)
 * - If simulation active → SimulationResults (collapsible)
 * - If simulation idle AND one node selected → ConfigSidebar
 * - Else → nothing
 */
function RightPanel({
    collapsed,
    onToggle,
}: {
    collapsed?: boolean;
    onToggle?: () => void;
}) {
    const simStatus = useCanvasSimulationStore((s) => s.status);
    const traceHistory = useCanvasSimulationStore((s) => s.traceHistory);
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const simActive = simStatus === 'running' || simStatus === 'paused' || simStatus === 'completed';

    if (simActive && selectedNodeIds.length === 1) return <LiveComponentInspector nodeId={selectedNodeIds[0]} />;
    if (traceHistory.length > 0) return <RequestTracePanel collapsed={collapsed} onToggle={onToggle} />;
    if (simActive) return <SimulationResults collapsed={collapsed} onToggle={onToggle} />;
    if (selectedNodeIds.length === 1) return <ConfigSidebar />;
    return null;
}

export default function SandboxPage() {
    const [paletteCollapsed, setPaletteCollapsed] = useState(false);
    const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
    return (
        <div
            style={{
                height: '100vh',
                display: 'flex',
                background: '#121826',
                overflow: 'hidden',
            }}
        >
            {/* Left — Component Palette */}
            <div style={{ flexShrink: 0 }}>
                <ComponentPalette
                    collapsed={paletteCollapsed}
                    onToggle={() => setPaletteCollapsed((v) => !v)}
                />
            </div>

            {/* Center — Canvas */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
                <SystemCanvas />

                {/* Top-left: title + delete when selection */}
                <SandboxTitleBar />

                {/* Top-right: simulation controls + metrics */}
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        pointerEvents: 'auto',
                    }}
                >
                    <SimulationControls />
                </div>
            </div>

            {/* Right — Config or Results panel */}
            <RightPanel
                collapsed={rightPanelCollapsed}
                onToggle={() => setRightPanelCollapsed((v) => !v)}
            />
        </div>
    );
}

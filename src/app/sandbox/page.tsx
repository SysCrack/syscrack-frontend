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

import dynamic from 'next/dynamic';
import ConfigSidebar from '@/components/system-canvas/ConfigSidebar';
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

/**
 * Right panel logic:
 * - If simulation completed → show SimulationResults
 * - Else if a component is selected → show ConfigSidebar
 * - Else → nothing
 */
function RightPanel() {
    const simStatus = useCanvasSimulationStore((s) => s.status);
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);

    if (simStatus === 'running' || simStatus === 'paused' || simStatus === 'completed') return <SimulationResults />;
    if (selectedNodeIds.length === 1) return <ConfigSidebar />;
    return null;
}

export default function SandboxPage() {
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
                <ComponentPalette />
            </div>

            {/* Center — Canvas */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
                <SystemCanvas />

                {/* Top-left: title */}
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
                        pointerEvents: 'none',
                    }}
                >
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
                        🧪 Sandbox
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif' }}>
                        Drag components • Click ports to connect • Configure
                    </span>
                </div>

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
            <RightPanel />
        </div>
    );
}

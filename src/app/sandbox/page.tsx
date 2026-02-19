/**
 * /sandbox — Free-form system design canvas.
 * 
 * Uses the new react-konva canvas with component palette and config sidebar.
 * Config sidebar only appears when a component is selected.
 * 
 * Only Konva-dependent components use dynamic import (ssr: false).
 * ConfigSidebar is pure HTML — imported normally so Zustand subscriptions work.
 */
'use client';

import dynamic from 'next/dynamic';
import ConfigSidebar from '@/components/system-canvas/ConfigSidebar';

// Only Konva components need dynamic import (they access `window`)
const SystemCanvas = dynamic(
    () => import('@/components/system-canvas/SystemCanvas'),
    { ssr: false },
);
const ComponentPalette = dynamic(
    () => import('@/components/system-canvas/ComponentPalette'),
    { ssr: false },
);

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

            {/* Center — Canvas — minWidth:0 lets it shrink when sidebar appears */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
                <SystemCanvas />

                {/* Top-left title */}
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
            </div>

            {/* Right — Config Sidebar (self-hides when nothing selected) */}
            <ConfigSidebar />
        </div>
    );
}

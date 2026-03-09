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

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import ConfigSidebar from '@/components/system-canvas/ConfigSidebar';
import ConnectionConfigPanel from '@/components/system-canvas/ConnectionConfigPanel';
import LiveComponentInspector from '@/components/system-canvas/LiveComponentInspector';
import RequestTracePanel from '@/components/system-canvas/RequestTracePanel';
import SimulationControls from '@/components/system-canvas/SimulationControls';
import SimulationResults from '@/components/system-canvas/SimulationResults';
import { TopNav } from '@/components/layout/TopNav';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';
import TemplatePicker from '@/components/templates/TemplatePicker';
import RationaleBanner from '@/components/templates/RationaleBanner';
import { getTemplateById } from '@/lib/templates';
import { getDesignById } from '@/lib/api/designs';
import { supabase } from '@/lib/supabase/client';
import SaveButton from '@/components/canvas/SaveButton';
import ShareButton from '@/components/canvas/ShareButton';
import MyDesignsPanel from '@/components/canvas/MyDesignsPanel';

// Only Konva components need dynamic import (they access `window`)
const SystemCanvas = dynamic(
    () => import('@/components/system-canvas/SystemCanvas'),
    { ssr: false },
);
const ComponentPalette = dynamic(
    () => import('@/components/system-canvas/ComponentPalette'),
    { ssr: false },
);

function handleOverlayDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
}

function handleOverlayDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const componentType = e.dataTransfer.getData('application/syscrack-component');
    if (componentType) {
        window.dispatchEvent(new CustomEvent('syscrack-palette-drop', {
            detail: { clientX: e.clientX, clientY: e.clientY, componentType },
        }));
    }
}

function SandboxTitleBar() {
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const selectedConnectionId = useCanvasStore((s) => s.selectedConnectionId);
    const deleteSelected = useCanvasStore((s) => s.deleteSelected);
    const hasSelection = selectedNodeIds.length > 0 || selectedConnectionId !== null;

    return (
        <div
            onDragOver={handleOverlayDragOver}
            onDrop={handleOverlayDrop}
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
            <Link
                href="/"
                style={{
                    marginLeft: 8,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#bfdbfe',
                    background: 'rgba(59, 130, 246, 0.12)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textDecoration: 'none',
                }}
            >
                Exit to dashboard
            </Link>
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
 * - If simulation active AND one node selected → LiveComponentInspector (metrics)
 * - If traceHistory has traces (step-through debug) → RequestTracePanel (collapsible)
 * - If simulation active → SimulationResults (collapsible)
 * - If simulation idle AND one node selected → ConfigSidebar
 * - If connection selected → ConnectionConfigPanel
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
    const selectedConnectionId = useCanvasStore((s) => s.selectedConnectionId);
    const activeTemplateId = useCanvasStore((s) => s.activeTemplateId);
    const simActive = simStatus === 'running' || simStatus === 'paused' || simStatus === 'completed';

    const workloadHints = (() => {
        const template = activeTemplateId ? getTemplateById(activeTemplateId) : null;
        const arch = template?.workloadProfile?.archetypes?.find(
            (a) => a.cacheKeyPattern && a.sampleData && a.sampleData.length > 0,
        );
        if (!arch) return undefined;
        return { cacheKeyPattern: arch.cacheKeyPattern, sampleData: arch.sampleData };
    })();

    if (simActive && selectedNodeIds.length === 1) return <LiveComponentInspector nodeId={selectedNodeIds[0]} workloadHints={workloadHints} />;
    if (traceHistory.length > 0) return <RequestTracePanel collapsed={collapsed} onToggle={onToggle} />;
    if (simActive) return <SimulationResults collapsed={collapsed} onToggle={onToggle} />;
    if (selectedNodeIds.length === 1) return <ConfigSidebar />;
    if (selectedConnectionId) return <ConnectionConfigPanel />;
    return null;
}

export default function SandboxPage() {
    const searchParams = useSearchParams();
    const [paletteCollapsed, setPaletteCollapsed] = useState(false);
    const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [myDesignsOpen, setMyDesignsOpen] = useState(false);
    const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [designName, setDesignName] = useState('');
    const activeTemplateId = useCanvasStore((s) => s.activeTemplateId);
    const templateBannerDismissed = useCanvasStore((s) => s.templateBannerDismissed);
    const activeTemplate = activeTemplateId ? getTemplateById(activeTemplateId) : null;
    const showRationaleBanner = activeTemplate != null && !templateBannerDismissed;

    // Restore on mount
    useEffect(() => {
        useCanvasStore.getState().loadFromLocalStorage();
    }, []);

    // Open design from URL (e.g. after fork redirect)
    useEffect(() => {
        const id = searchParams.get('designId');
        if (!id) return;
        supabase.auth.getUser().then((res: { data?: { user?: { id: string } | null } }) => {
            if (!res.data?.user) return;
            getDesignById(id)
                .then((design) => {
                    useCanvasStore.getState().loadDesignFull(
                        design.nodes,
                        design.connections,
                        design.viewport,
                        design.template,
                    );
                    setCurrentDesignId(design.id);
                    setDesignName(design.metadata.name);
                    setShareUrl(design.metadata.shareToken
                        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/design/share/${design.metadata.shareToken}`
                        : null);
                })
                .catch(() => { /* ignore */ });
        });
    }, [searchParams]);

    // Auto-save indicator state
    const [lastSavedLabel, setLastSavedLabel] = useState<string>('');
    useEffect(() => {
        function update() {
            try {
                const raw = localStorage.getItem('syscrack-canvas-autosave');
                if (!raw) return;
                const { savedAt } = JSON.parse(raw);
                const mins = Math.round((Date.now() - new Date(savedAt).getTime()) / 60000);
                setLastSavedLabel(mins < 1 ? 'Saved just now' : `Saved ${mins}m ago`);
            } catch { /* ignore */ }
        }
        update();
        const id = setInterval(update, 30000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-[var(--color-canvas-bg)]">
            <TopNav />
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Rationale banner (between toolbar and canvas) */}
                {showRationaleBanner && activeTemplate && (
                    <RationaleBanner
                        template={activeTemplate}
                        onDismiss={() => useCanvasStore.setState({ templateBannerDismissed: true })}
                        onClearTemplate={() => useCanvasStore.getState().clearTemplate()}
                    />
                )}

                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Left — Component Palette */}
                    <div
                        style={{
                            flexShrink: 0,
                            minHeight: 0,
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
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

                        {/* Templates + save indicator (below title bar) */}
                        <div
                            onDragOver={handleOverlayDragOver}
                            onDrop={handleOverlayDrop}
                            style={{
                                position: 'absolute',
                                top: 56,
                                left: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                pointerEvents: 'auto',
                            }}
                        >
                            <button
                                onClick={() => setShowTemplatePicker(true)}
                                style={{
                                    padding: '5px 12px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#bfdbfe',
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    border: '1px solid rgba(59, 130, 246, 0.4)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                📋 Templates
                            </button>
                            <SaveButton
                                designId={currentDesignId}
                                designName={designName}
                                onSaved={setCurrentDesignId}
                                onNameChange={setDesignName}
                            />
                            <ShareButton
                                designId={currentDesignId}
                                shareUrl={shareUrl}
                                onShareUrl={setShareUrl}
                            />
                            <button
                                onClick={() => setMyDesignsOpen(true)}
                                style={{
                                    padding: '5px 12px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#94a3b8',
                                    background: 'rgba(30, 41, 59, 0.9)',
                                    border: '1px solid #2a3244',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                My Designs
                            </button>
                            {lastSavedLabel && (
                                <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif' }}>
                                    {lastSavedLabel}
                                </span>
                            )}
                        </div>

                        {/* Top-right: simulation controls + metrics */}
                        <div
                            onDragOver={handleOverlayDragOver}
                            onDrop={handleOverlayDrop}
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
                    <div
                        style={{
                            minHeight: 0,
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <RightPanel
                            collapsed={rightPanelCollapsed}
                            onToggle={() => setRightPanelCollapsed((v) => !v)}
                        />
                    </div>
                </div>
            </main>

            {/* Template Picker modal */}
            <TemplatePicker open={showTemplatePicker} onClose={() => setShowTemplatePicker(false)} />
            <MyDesignsPanel
                open={myDesignsOpen}
                onClose={() => setMyDesignsOpen(false)}
                onSelectDesign={(id, name, token) => {
                    setCurrentDesignId(id);
                    setDesignName(name);
                    setShareUrl(token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/design/share/${token}` : null);
                }}
            />
        </div>
    );
}

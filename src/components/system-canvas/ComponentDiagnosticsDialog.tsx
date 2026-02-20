/**
 * ComponentDiagnosticsDialog — modal showing component diagnostics with actionable fixes.
 * 
 * Displays severity, message, cause, and a "Fix" button that applies the suggested fix.
 * Inspired by paperdraw.dev's component diagnostics dialog.
 */
'use client';

import { useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';
import type { SimulationDiagnostic } from '@/lib/simulation/types';
import type { CanvasNode } from '@/lib/types/canvas';

const font = 'Inter, system-ui, sans-serif';

interface ComponentDiagnosticsDialogProps {
    diagnostic: SimulationDiagnostic;
    node: CanvasNode;
    isOpen: boolean;
    onClose: () => void;
}

export default function ComponentDiagnosticsDialog({
    diagnostic,
    node,
    isOpen,
    onClose,
}: ComponentDiagnosticsDialogProps) {
    const updateNodeSharedConfig = useCanvasStore((s) => s.updateNodeSharedConfig);
    const updateNodeSpecificConfig = useCanvasStore((s) => s.updateNodeSpecificConfig);

    const handleFix = useCallback(() => {
        if (diagnostic.eventType === 'spof') {
            // SPOF fix: Increase instances
            const currentInstances = node.sharedConfig.scaling?.instances ?? 1;
            updateNodeSharedConfig(node.id, {
                scaling: {
                    ...node.sharedConfig.scaling!,
                    instances: Math.max(2, currentInstances + 1),
                },
            });
        } else if (diagnostic.eventType === 'overloaded' || diagnostic.eventType === 'high_utilization') {
            // Overload fix: Increase instances or capacity
            const currentInstances = node.sharedConfig.scaling?.instances ?? 1;
            const currentCapacity = node.sharedConfig.scaling?.nodeCapacityRps ?? 1000;
            
            if (node.type === 'app_server' && (node.specificConfig as any)?.autoScaling !== true) {
                // Enable auto-scaling for app servers
                updateNodeSpecificConfig(node.id, { autoScaling: true });
            } else {
                // Increase instances
                updateNodeSharedConfig(node.id, {
                    scaling: {
                        ...node.sharedConfig.scaling!,
                        instances: Math.max(2, currentInstances + 1),
                    },
                });
            }
        }

        onClose();
    }, [diagnostic, node, updateNodeSharedConfig, updateNodeSpecificConfig, onClose]);

    if (!isOpen) return null;

    const severityColors = {
        critical: { bg: '#7f1d1d', border: '#ef4444', text: '#fca5a5' },
        warning: { bg: '#78350f', border: '#f59e0b', text: '#fde68a' },
        info: { bg: '#1e3a8a', border: '#3b82f6', text: '#93c5fd' },
    };

    const colors = severityColors[diagnostic.severity] || severityColors.warning;

    // Extract fix action text from suggestion
    const fixAction = diagnostic.suggestion.includes('Increase instances')
        ? 'Increase Instances'
        : diagnostic.suggestion.includes('auto-scaling')
        ? 'Enable Auto-Scaling'
        : 'Apply Fix';

    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 9998,
                    backdropFilter: 'blur(4px)',
                }}
                onClick={onClose}
            />

            {/* Dialog */}
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9999,
                    width: '90%',
                    maxWidth: 480,
                    background: '#181e2e',
                    border: `2px solid ${colors.border}`,
                    borderRadius: 12,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                    fontFamily: font,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: `1px solid ${colors.border}40`,
                        background: `${colors.bg}20`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: colors.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 20,
                        }}
                    >
                        {diagnostic.severity === 'critical' ? '🔴' : diagnostic.severity === 'warning' ? '⚠️' : 'ℹ️'}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: colors.text,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}
                        >
                            {diagnostic.severity === 'critical' ? 'CRITICAL' : diagnostic.severity === 'warning' ? 'WARNING' : 'INFO'}
                        </div>
                        <div
                            style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: '#e2e8f0',
                                marginTop: 2,
                            }}
                        >
                            {diagnostic.componentName}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #2a3244',
                            background: '#121826',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#1e293b';
                            e.currentTarget.style.color = '#e2e8f0';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#121826';
                            e.currentTarget.style.color = '#94a3b8';
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px' }}>
                    {/* Message */}
                    <div
                        style={{
                            fontSize: 14,
                            color: '#e2e8f0',
                            lineHeight: 1.6,
                            marginBottom: 16,
                        }}
                    >
                        {diagnostic.message}
                    </div>

                    {/* Cause */}
                    {diagnostic.metricValue !== undefined && (
                        <div
                            style={{
                                padding: '12px',
                                background: '#121826',
                                border: '1px solid #2a3244',
                                borderRadius: 6,
                                marginBottom: 16,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 11,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: 4,
                                }}
                            >
                                Cause
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>
                                {diagnostic.eventType === 'overloaded' && `Utilization: ${(diagnostic.metricValue * 100).toFixed(1)}%`}
                                {diagnostic.eventType === 'high_utilization' && `Utilization: ${(diagnostic.metricValue * 100).toFixed(1)}%`}
                                {diagnostic.eventType === 'spof' && 'Single instance (no redundancy)'}
                            </div>
                        </div>
                    )}

                    {/* Suggestion */}
                    <div
                        style={{
                            padding: '12px',
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            marginBottom: 20,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                color: '#64748b',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 6,
                            }}
                        >
                            💡 Suggestion
                        </div>
                        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                            {diagnostic.suggestion}
                        </div>
                    </div>

                    {/* Fix Button */}
                    <button
                        onClick={handleFix}
                        style={{
                            width: '100%',
                            padding: '12px 20px',
                            background: colors.border,
                            border: 'none',
                            borderRadius: 8,
                            color: '#000',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '0.9';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        🔧 {fixAction}
                    </button>
                </div>
            </div>
        </>
    );
}

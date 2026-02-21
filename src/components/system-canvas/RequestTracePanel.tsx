/**
 * RequestTracePanel — expandable/collapsible list of request traces from step-through debug.
 * Shown when traceHistory has entries (after Inject 1 Request + stepping until completion).
 */
'use client';

import { useState, useEffect } from 'react';
import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';
import type { RequestTrace, RequestTraceEvent } from '@/lib/simulation/types';
import { getCatalogEntry } from '@/lib/data/componentCatalog';

const font = 'Inter, system-ui, sans-serif';
const panelWidth = 320;

interface RequestTracePanelProps {
    collapsed?: boolean;
    onToggle?: () => void;
}

function NodeIcon({ nodeType }: { nodeType: string }) {
    const entry = getCatalogEntry(nodeType);
    const icon = entry?.icon ?? '●';
    return (
        <span
            style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                background: 'rgba(59, 130, 246, 0.2)',
                fontSize: 12,
                flexShrink: 0,
            }}
        >
            {icon}
        </span>
    );
}

function TraceEventRow({ event, isLast }: { event: RequestTraceEvent; isLast: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <NodeIcon nodeType={event.nodeType} />
                {!isLast && (
                    <div
                        style={{
                            width: 2,
                            flex: 1,
                            minHeight: 16,
                            background: '#334155',
                            marginTop: 4,
                        }}
                    />
                )}
            </div>
            <div style={{ flex: 1, paddingBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                    {event.nodeName}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                    {event.action}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    tick {event.timestamp}
                </div>
            </div>
        </div>
    );
}

function TraceSection({ trace, index, isExpanded, onToggle }: { trace: RequestTrace; index: number; isExpanded: boolean; onToggle: () => void }) {
    const hops = trace.events.length;
    const statusColor = trace.completed ? '#22c55e' : '#f59e0b';
    const statusLabel = trace.completed ? 'Completed' : 'Incomplete';

    return (
        <div
            style={{
                border: '1px solid #2a3244',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 8,
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                style={{
                    width: '100%',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isExpanded ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: font,
                    color: '#e2e8f0',
                    fontSize: 12,
                    textAlign: 'left',
                }}
            >
                <span style={{ fontWeight: 600 }}>
                    Trace #{index + 1}
                    <span style={{ marginLeft: 8, color: '#64748b', fontWeight: 400 }}>
                        ({hops} hop{hops !== 1 ? 's' : ''})
                    </span>
                </span>
                <span
                    style={{
                        fontSize: 10,
                        color: statusColor,
                        fontWeight: 600,
                        marginRight: 4,
                    }}
                >
                    {statusLabel}
                </span>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>{isExpanded ? '▼' : '▶'}</span>
            </button>
            {isExpanded && (
                <div style={{ padding: '0 12px 12px 12px', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {trace.events.map((event, i) => (
                            <TraceEventRow
                                key={`${event.nodeId}-${event.timestamp}-${i}`}
                                event={event}
                                isLast={i === trace.events.length - 1}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RequestTracePanel({ collapsed = false, onToggle }: RequestTracePanelProps) {
    const traceHistory = useCanvasSimulationStore((s) => s.traceHistory);
    const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0]));

    // Auto-expand the newest trace when a new one is added
    useEffect(() => {
        if (traceHistory.length === 0) return;
        const latestIndex = traceHistory.length - 1;
        setExpandedIndices((prev) => new Set([...prev, latestIndex]));
    }, [traceHistory.length]);

    if (traceHistory.length === 0) return null;
    const toggleExpanded = (index: number) => {
        setExpandedIndices((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    if (collapsed && onToggle) {
        return (
            <div
                style={{
                    width: 36,
                    flexShrink: 0,
                    height: '100%',
                    background: 'rgba(18, 24, 38, 0.95)',
                    borderLeft: '1px solid #2a3244',
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: font,
                    transition: 'width 0.2s ease',
                }}
            >
                <button
                    type="button"
                    onClick={onToggle}
                    title="Expand request traces"
                    style={{
                        width: '100%',
                        height: '100%',
                        minHeight: 120,
                        padding: 8,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    ◀
                </button>
            </div>
        );
    }

    return (
        <div
            style={{
                width: panelWidth,
                flexShrink: 0,
                background: 'rgba(18, 24, 38, 0.95)',
                borderLeft: '1px solid #2a3244',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: font,
                transition: 'width 0.2s ease',
            }}
        >
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #2a3244',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Request Traces ({traceHistory.length})
                </span>
                {onToggle && (
                    <button
                        type="button"
                        onClick={onToggle}
                        title="Collapse panel"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            fontSize: 14,
                            padding: 4,
                        }}
                    >
                        ▶
                    </button>
                )}
            </div>

            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
                {traceHistory.map((trace, i) => (
                    <TraceSection
                        key={i}
                        trace={trace}
                        index={i}
                        isExpanded={expandedIndices.has(i)}
                        onToggle={() => toggleExpanded(i)}
                    />
                ))}
            </div>
        </div>
    );
}

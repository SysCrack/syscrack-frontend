/**
 * RequestTracePanel — timeline view of trace events for step-through debug.
 * Shown when lastTrace is set (after Inject 1 Request + stepping until completion).
 */
'use client';

import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';
import type { RequestTraceEvent } from '@/lib/simulation/types';
import { getCatalogEntry } from '@/lib/data/componentCatalog';

const font = 'Inter, system-ui, sans-serif';
const panelWidth = 320;

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

export default function RequestTracePanel() {
    const lastTrace = useCanvasSimulationStore((s) => s.lastTrace);
    const reset = useCanvasSimulationStore((s) => s.reset);

    if (!lastTrace) return null;

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
                    Request Trace
                </span>
                <span
                    style={{
                        fontSize: 10,
                        color: lastTrace.completed ? '#22c55e' : '#f59e0b',
                        fontWeight: 600,
                    }}
                >
                    {lastTrace.completed ? 'Completed' : 'Incomplete'}
                </span>
            </div>

            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {lastTrace.events.map((event, i) => (
                        <TraceEventRow
                            key={`${event.nodeId}-${event.timestamp}-${i}`}
                            event={event}
                            isLast={i === lastTrace.events.length - 1}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

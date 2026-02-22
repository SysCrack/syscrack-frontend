/**
 * ConnectionConfigPanel — config for the selected connection.
 * Shown in the right panel when a connection is selected (no node, no simulation).
 */
'use client';

import { useCanvasStore } from '@/stores/canvasStore';
import { getProtocolWarning } from '@/lib/connectionRules';
import type { ConnectionProtocol } from '@/lib/types/canvas';

const font = 'Inter, system-ui, sans-serif';
const PROTOCOLS: ConnectionProtocol[] = ['http', 'grpc', 'websocket', 'tcp', 'udp', 'custom'];

export default function ConnectionConfigPanel() {
    const selectedConnectionId = useCanvasStore((s) => s.selectedConnectionId);
    const connections = useCanvasStore((s) => s.connections);
    const nodes = useCanvasStore((s) => s.nodes);
    const updateConnection = useCanvasStore((s) => s.updateConnection);

    const connection = connections.find((c) => c.id === selectedConnectionId);
    if (!connection) return null;

    const source = nodes.find((n) => n.id === connection.sourceId);
    const target = nodes.find((n) => n.id === connection.targetId);
    const protocolWarning =
        source && target
            ? getProtocolWarning(source.type, target.type, connection.protocol)
            : null;

    return (
        <div
            style={{
                width: 260,
                minWidth: 260,
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
            <div style={{ padding: 12, borderBottom: '1px solid #2a3244' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Connection
                </div>
                <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                    {source?.name ?? '?'} → {target?.name ?? '?'}
                </div>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                        Protocol
                    </label>
                    <select
                        value={connection.protocol}
                        onChange={(e) => updateConnection(connection.id, { protocol: e.target.value as ConnectionProtocol })}
                        style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            color: '#e2e8f0',
                            fontSize: 12,
                        }}
                    >
                        {PROTOCOLS.map((p) => (
                            <option key={p} value={p}>
                                {p.toUpperCase()}
                            </option>
                        ))}
                    </select>
                    {protocolWarning && (
                        <div
                            style={{
                                marginTop: 6,
                                padding: '6px 8px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                borderRadius: 6,
                                fontSize: 11,
                                color: '#fbbf24',
                            }}
                        >
                            {protocolWarning}
                        </div>
                    )}
                </div>

                <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                        Label (optional)
                    </label>
                    <input
                        type="text"
                        value={connection.label ?? ''}
                        onChange={(e) => updateConnection(connection.id, { label: e.target.value || undefined })}
                        placeholder="e.g. API calls"
                        style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            color: '#e2e8f0',
                            fontSize: 12,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

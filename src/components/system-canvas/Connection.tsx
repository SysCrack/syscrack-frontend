/**
 * Connection — renders a bezier curve between two nodes on the canvas.
 * 
 * Handles selection, hover effects, protocol coloring, and labels.
 * Calculates the optimal path between source and target node edges.
 */
'use client';

import { Group, Line, Text, Circle } from 'react-konva';
import { useMemo, useState, useCallback } from 'react';
import type Konva from 'konva';
import type { CanvasConnection, CanvasNode } from '@/lib/types/canvas';

// ============ Protocol Colors ============

const PROTOCOL_COLORS: Record<string, string> = {
    http: '#3b82f6',
    grpc: '#22c55e',
    websocket: '#eab308',
    tcp: '#a855f7',
    udp: '#ef4444',
    custom: '#64748b',
};

// ============ Props ============

interface ConnectionProps {
    connection: CanvasConnection;
    sourceNode: CanvasNode;
    targetNode: CanvasNode;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

// ============ Helpers ============

function getNodeCenter(node: CanvasNode) {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function getEdgePoint(
    center: { x: number; y: number },
    target: { x: number; y: number },
    width: number,
    height: number,
) {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const angle = Math.atan2(dy, dx);

    // Check which edge the line crosses
    const hw = width / 2;
    const hh = height / 2;

    const tanAngle = Math.abs(Math.tan(angle));
    const edge = tanAngle > hh / hw ? 'vertical' : 'horizontal';

    if (edge === 'horizontal') {
        const x = center.x + (dx > 0 ? hw : -hw);
        const y = center.y + (dx > 0 ? hw : -hw) * Math.tan(angle);
        return { x, y };
    } else {
        const y = center.y + (dy > 0 ? hh : -hh);
        const x = center.x + (dy > 0 ? hh : -hh) / Math.tan(angle);
        return { x, y };
    }
}

// ============ Component ============

export default function Connection({
    connection,
    sourceNode,
    targetNode,
    isSelected,
    onSelect,
}: ConnectionProps) {
    const [isHovered, setIsHovered] = useState(false);
    const color = PROTOCOL_COLORS[connection.protocol] || PROTOCOL_COLORS.custom;

    const { points, midX, midY } = useMemo(() => {
        const sc = getNodeCenter(sourceNode);
        const tc = getNodeCenter(targetNode);
        const sp = getEdgePoint(sc, tc, sourceNode.width, sourceNode.height);
        const tp = getEdgePoint(tc, sc, targetNode.width, targetNode.height);

        // Cubic bezier control points
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;

        // Prefer horizontal curves
        const cpOffset = Math.max(Math.abs(dx) * 0.3, 40);
        const cp1x = sp.x + (Math.abs(dx) > Math.abs(dy) ? cpOffset * Math.sign(dx) : 0);
        const cp1y = sp.y + (Math.abs(dy) > Math.abs(dx) ? cpOffset * Math.sign(dy) : 0);
        const cp2x = tp.x - (Math.abs(dx) > Math.abs(dy) ? cpOffset * Math.sign(dx) : 0);
        const cp2y = tp.y - (Math.abs(dy) > Math.abs(dx) ? cpOffset * Math.sign(dy) : 0);

        return {
            points: [sp.x, sp.y, cp1x, cp1y, cp2x, cp2y, tp.x, tp.y],
            midX: (sp.x + tp.x) / 2,
            midY: (sp.y + tp.y) / 2,
        };
    }, [sourceNode.x, sourceNode.y, sourceNode.width, sourceNode.height, targetNode.x, targetNode.y, targetNode.width, targetNode.height]);

    const handleClick = useCallback(
        (e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            onSelect(connection.id);
        },
        [connection.id, onSelect],
    );

    const handleTap = useCallback(
        (e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true;
            onSelect(connection.id);
        },
        [connection.id, onSelect],
    );

    return (
        <Group>
            {/* Invisible wide hit area */}
            <Line
                points={points}
                bezier
                stroke="transparent"
                strokeWidth={16}
                onClick={handleClick}
                onTap={handleTap}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            />

            {/* Visible line */}
            <Line
                points={points}
                bezier
                stroke={isSelected ? '#60a5fa' : isHovered ? color : color}
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
                opacity={isHovered || isSelected ? 1 : 0.7}
                dash={connection.protocol === 'websocket' ? [8, 4] : undefined}
                listening={false}
            />

            {/* Protocol dot at midpoint */}
            <Circle
                x={midX}
                y={midY}
                radius={isHovered || isSelected ? 6 : 4}
                fill={color}
                stroke="#0f172a"
                strokeWidth={2}
                listening={false}
            />

            {/* Label or protocol name on hover */}
            {(isHovered || isSelected || connection.label) && (
                <Text
                    text={connection.label || connection.protocol.toUpperCase()}
                    x={midX + 10}
                    y={midY - 8}
                    fontSize={10}
                    fontFamily="Inter, system-ui, sans-serif"
                    fontStyle="600"
                    fill={isSelected ? '#60a5fa' : '#94a3b8'}
                    listening={false}
                />
            )}

            {/* Bidirectional arrows */}
            {connection.bidirectional && (
                <>
                    <Circle
                        x={points[0]}
                        y={points[1]}
                        radius={3}
                        fill={color}
                        listening={false}
                    />
                    <Circle
                        x={points[6]}
                        y={points[7]}
                        radius={3}
                        fill={color}
                        listening={false}
                    />
                </>
            )}
        </Group>
    );
}

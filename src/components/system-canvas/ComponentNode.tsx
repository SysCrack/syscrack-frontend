/**
 * ComponentNode — renders a single system design component on the Konva canvas.
 * 
 * Handles selection, dragging, hover effects, and port rendering.
 * Uses the component catalog for icon/label lookup.
 */
'use client';

import { Group, Rect, Text, Circle } from 'react-konva';
import { useRef, useState, useCallback } from 'react';
import type Konva from 'konva';
import type { CanvasNode } from '@/lib/types/canvas';
import { getCatalogEntry } from '@/lib/data/componentCatalog';

// ============ Colors ============

const COLORS = {
    traffic: { bg: '#1e2a3a', border: '#3b82f6', borderHover: '#60a5fa' },
    compute: { bg: '#1e2b24', border: '#22c55e', borderHover: '#4ade80' },
    storage: { bg: '#2a1e2e', border: '#a855f7', borderHover: '#c084fc' },
    messaging: { bg: '#2a2a1e', border: '#eab308', borderHover: '#facc15' },
    ai: { bg: '#1e2a2a', border: '#06b6d4', borderHover: '#22d3ee' },
    techniques: { bg: '#2a2020', border: '#ef4444', borderHover: '#f87171' },
} as const;

const SELECTED_SHADOW_COLOR = '#3b82f6';
const PORT_RADIUS = 5;
const PORT_COLOR = '#475569';
const PORT_HOVER_COLOR = '#94a3b8';

// ============ Props ============

interface ComponentNodeProps {
    node: CanvasNode;
    isSelected: boolean;
    onSelect: (id: string, multi: boolean) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
    onPortClick: (nodeId: string) => void;
    isConnecting: boolean;
}

// ============ Component ============

export default function ComponentNode({
    node,
    isSelected,
    onSelect,
    onDragEnd,
    onPortClick,
    isConnecting,
}: ComponentNodeProps) {
    const groupRef = useRef<Konva.Group>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredPort, setHoveredPort] = useState<string | null>(null);

    const catalog = getCatalogEntry(node.type);
    const category = catalog?.category || 'compute';
    const colors = COLORS[category as keyof typeof COLORS] || COLORS.compute;
    const icon = catalog?.icon || '❓';

    const { width, height } = node;
    const cornerRadius = 10;

    // Port positions — one on each side
    const ports = [
        { id: 'top', x: width / 2, y: 0 },
        { id: 'right', x: width, y: height / 2 },
        { id: 'bottom', x: width / 2, y: height },
        { id: 'left', x: 0, y: height / 2 },
    ];

    const handleClick = useCallback(
        (e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            onSelect(node.id, e.evt.shiftKey);
        },
        [node.id, onSelect],
    );

    const handleTap = useCallback(
        (e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true;
            onSelect(node.id, false);
        },
        [node.id, onSelect],
    );

    const handleDragEnd = useCallback(
        (e: Konva.KonvaEventObject<DragEvent>) => {
            onDragEnd(node.id, e.target.x(), e.target.y());
        },
        [node.id, onDragEnd],
    );

    const handlePortEnter = useCallback((portId: string) => {
        setHoveredPort(portId);
    }, []);

    const handlePortLeave = useCallback(() => {
        setHoveredPort(null);
    }, []);

    const handlePortClick = useCallback(
        (e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            onPortClick(node.id);
        },
        [node.id, onPortClick],
    );

    const handlePortTap = useCallback(
        (e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true;
            onPortClick(node.id);
        },
        [node.id, onPortClick],
    );

    return (
        <Group
            ref={groupRef}
            x={node.x}
            y={node.y}
            draggable
            onClick={handleClick}
            onTap={handleTap}
            onDragEnd={handleDragEnd}
            onMouseEnter={() => {
                setIsHovered(true);
                if (groupRef.current) {
                    groupRef.current.getStage()!.container().style.cursor = 'pointer';
                }
            }}
            onMouseLeave={() => {
                setIsHovered(false);
                if (groupRef.current) {
                    groupRef.current.getStage()!.container().style.cursor = 'default';
                }
            }}
        >
            {/* Main body */}
            <Rect
                width={width}
                height={height}
                fill={colors.bg}
                stroke={isSelected ? SELECTED_SHADOW_COLOR : isHovered ? colors.borderHover : colors.border}
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
                cornerRadius={cornerRadius}
                shadowColor={isSelected ? SELECTED_SHADOW_COLOR : undefined}
                shadowBlur={isSelected ? 12 : 0}
                shadowOpacity={isSelected ? 0.4 : 0}
            />

            {/* Icon */}
            <Text
                text={icon}
                x={12}
                y={height / 2 - 12}
                fontSize={22}
                listening={false}
            />

            {/* Label */}
            <Text
                text={node.name}
                x={42}
                y={16}
                fontSize={13}
                fontFamily="Inter, system-ui, sans-serif"
                fontStyle="600"
                fill="#e2e8f0"
                width={width - 54}
                ellipsis
                wrap="none"
                listening={false}
            />

            {/* Subtitle (type) */}
            <Text
                text={catalog?.description?.split('—')[0]?.trim() || node.type}
                x={42}
                y={36}
                fontSize={10}
                fontFamily="Inter, system-ui, sans-serif"
                fill="#64748b"
                width={width - 54}
                ellipsis
                wrap="none"
                listening={false}
            />

            {/* Scaling badge */}
            {node.sharedConfig.scaling && node.sharedConfig.scaling.replicas > 1 && (
                <Group x={width - 28} y={height - 22}>
                    <Rect
                        width={20}
                        height={16}
                        fill="#1e293b"
                        stroke="#475569"
                        strokeWidth={1}
                        cornerRadius={4}
                    />
                    <Text
                        text={`×${node.sharedConfig.scaling.replicas}`}
                        x={3}
                        y={2}
                        fontSize={10}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill="#94a3b8"
                        listening={false}
                    />
                </Group>
            )}

            {/* Ports — visible on hover or when connecting */}
            {(isHovered || isConnecting) &&
                ports.map((port) => (
                    <Circle
                        key={port.id}
                        x={port.x}
                        y={port.y}
                        radius={hoveredPort === port.id ? PORT_RADIUS + 2 : PORT_RADIUS}
                        fill={hoveredPort === port.id ? PORT_HOVER_COLOR : PORT_COLOR}
                        stroke="#1e293b"
                        strokeWidth={2}
                        onMouseEnter={() => handlePortEnter(port.id)}
                        onMouseLeave={handlePortLeave}
                        onClick={handlePortClick}
                        onTap={handlePortTap}
                    />
                ))}
        </Group>
    );
}

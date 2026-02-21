/**
 * ComponentNode — renders a single system design component on the Konva canvas.
 * 
 * Handles selection, dragging, hover effects, port rendering,
 * and simulation overlays (health glow, SPOF badge, latency badge).
 */
'use client';

import { Group, Rect, Text, Circle } from 'react-konva';
import { useRef, useState, useCallback } from 'react';
import type Konva from 'konva';
import type { CanvasNode } from '@/lib/types/canvas';
import type { NodeSimSummary } from '@/lib/simulation/types';
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

// Health glow colors
const HEALTH_COLORS = {
    healthy: '#22c55e',   // green
    warning: '#f59e0b',   // amber
    critical: '#ef4444',  // red
} as const;

// ============ Props ============

interface ComponentNodeProps {
    node: CanvasNode;
    isSelected: boolean;
    onSelect: (id: string, multi: boolean) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
    onPortClick: (nodeId: string) => void;
    isConnecting: boolean;
    // Simulation overlay data (undefined = no simulation active)
    simState?: NodeSimSummary;
    isSpof?: boolean;
    // Diagnostic click handler (opens diagnostics dialog)
    onDiagnosticClick?: () => void;
}

// ============ Component ============

export default function ComponentNode({
    node,
    isSelected,
    onSelect,
    onDragEnd,
    onPortClick,
    isConnecting,
    simState,
    isSpof,
    onDiagnosticClick,
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

    // Simulation-aware border color
    let borderColor: string = isHovered ? colors.borderHover : colors.border;
    let shadowColor: string | undefined = isSelected ? SELECTED_SHADOW_COLOR : undefined;
    let shadowBlur = isSelected ? 12 : 0;
    let shadowOpacity = isSelected ? 0.4 : 0;

    if (simState && !isSelected) {
        if (!simState.isHealthy) {
            borderColor = HEALTH_COLORS.critical;
            shadowColor = HEALTH_COLORS.critical;
            shadowBlur = 14;
            shadowOpacity = 0.5;
        } else if (simState.avgCpuPercent > 60) {
            borderColor = HEALTH_COLORS.warning;
            shadowColor = HEALTH_COLORS.warning;
            shadowBlur = 10;
            shadowOpacity = 0.35;
        } else {
            borderColor = HEALTH_COLORS.healthy;
            shadowColor = HEALTH_COLORS.healthy;
            shadowBlur = 8;
            shadowOpacity = 0.25;
        }
    }

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

    // CPU utilization bar width (0–100% of node width minus padding)
    const cpuBarWidth = simState
        ? Math.min(1, simState.avgCpuPercent / 100) * (width - 16)
        : 0;
    const cpuBarColor = simState
        ? simState.avgCpuPercent > 80 ? HEALTH_COLORS.critical
            : simState.avgCpuPercent > 60 ? HEALTH_COLORS.warning
                : HEALTH_COLORS.healthy
        : HEALTH_COLORS.healthy;

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
                stroke={isSelected ? SELECTED_SHADOW_COLOR : borderColor}
                strokeWidth={isSelected ? 2.5 : simState ? 2 : isHovered ? 2 : 1.5}
                cornerRadius={cornerRadius}
                shadowColor={shadowColor}
                shadowBlur={shadowBlur}
                shadowOpacity={shadowOpacity}
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
            {node.sharedConfig.scaling && node.sharedConfig.scaling.instances > 1 && (
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
                        text={`×${node.sharedConfig.scaling.instances}`}
                        x={3}
                        y={2}
                        fontSize={10}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill="#94a3b8"
                        listening={false}
                    />
                </Group>
            )}

            {/* ── Simulation Overlays ── */}

            {/* SPOF badge — top-right (clickable if diagnostic available) */}
            {isSpof && (
                <Group 
                    x={width - 42} 
                    y={-8}
                    onClick={onDiagnosticClick}
                    onTap={onDiagnosticClick}
                    style={{ cursor: onDiagnosticClick ? 'pointer' : 'default' }}
                >
                    <Rect
                        width={42}
                        height={16}
                        fill="#f59e0b"
                        cornerRadius={4}
                    />
                    <Text
                        text="⚠ SPOF"
                        x={3}
                        y={2}
                        fontSize={9}
                        fontFamily="Inter, system-ui, sans-serif"
                        fontStyle="700"
                        fill="#000"
                        listening={false}
                    />
                </Group>
            )}

            {/* Latency badge — bottom-center */}
            {simState && (
                <Group x={width / 2 - 22} y={height + 4}>
                    <Rect
                        width={44}
                        height={14}
                        fill="#0f172a"
                        stroke="#334155"
                        strokeWidth={1}
                        cornerRadius={3}
                    />
                    <Text
                        text={simState.avgLatencyMs < 1
                            ? `${simState.avgLatencyMs.toFixed(2)}ms`
                            : `${simState.avgLatencyMs.toFixed(1)}ms`}
                        x={3}
                        y={1}
                        fontSize={9}
                        fontFamily="monospace"
                        fill={simState.avgLatencyMs > 100 ? '#f87171' : simState.avgLatencyMs > 30 ? '#f59e0b' : '#94a3b8'}
                        listening={false}
                    />
                </Group>
            )}

            {/* CPU utilization bar — thin bar at bottom of node */}
            {simState && (
                <>
                    {/* Background bar */}
                    <Rect
                        x={8}
                        y={height - 6}
                        width={width - 16}
                        height={3}
                        fill="#1e293b"
                        cornerRadius={1}
                    />
                    {/* Fill bar */}
                    <Rect
                        x={8}
                        y={height - 6}
                        width={cpuBarWidth}
                        height={3}
                        fill={cpuBarColor}
                        cornerRadius={1}
                    />
                </>
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

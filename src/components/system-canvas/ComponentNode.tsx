/**
 * ComponentNode — renders a single system design component on the Konva canvas.
 * 
 * Handles selection, dragging, hover effects, port rendering,
 * and simulation overlays (health glow, SPOF badge, latency badge).
 */
'use client';

import { Group, Rect, Text, Circle, Line } from 'react-konva';
import { useRef, useState, useCallback, useEffect } from 'react';
import type Konva from 'konva';
import type { CanvasNode, CanvasComponentType } from '@/lib/types/canvas';
import { validateConnection, type TopologyWarning } from '@/lib/connectionRules';
import type { NodeSimSummary } from '@/lib/simulation/types';
import type { NodeDetailMetrics } from '@/lib/simulation/types';
import { getCatalogEntry } from '@/lib/data/componentCatalog';

// ============ Category border colors (by node.type) ============

const CATEGORY_BORDER_COLORS: Record<string, string> = {
    client: '#06b6d4',
    cdn: '#06b6d4',
    load_balancer: '#8b5cf6',
    api_gateway: '#8b5cf6',
    dns: '#8b5cf6',
    proxy: '#8b5cf6',
    app_server: '#3b82f6',
    serverless: '#3b82f6',
    worker: '#3b82f6',
    message_queue: '#f59e0b',
    pub_sub: '#f59e0b',
    cdc_connector: '#f59e0b',
    database_sql: '#10b981',
    database_nosql: '#10b981',
    cache: '#10b981',
    object_store: '#10b981',
    default: '#475569',
};

function latencyColor(ms: number | undefined): string {
    if (ms == null) return '#94a3b8';
    if (ms < 50) return '#22c55e';
    if (ms < 200) return '#fbbf24';
    return '#ef4444';
}

// ============ Colors ============

const SELECTED_STROKE = '#60a5fa';
const SELECTED_SHADOW_COLOR = '#3b82f6';
const PORT_RADIUS = 5;
const PORT_COLOR = '#475569';
const PORT_HOVER_COLOR = '#94a3b8';

// Health glow colors (spec: green, amber, red)
const HEALTH_COLORS = {
    healthy: '#22c55e',
    warning: '#fbbf24',
    critical: '#ef4444',
} as const;

const GLASS = {
    bg: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(255, 255, 255, 0.12)',
    shadowColor: 'rgba(0, 0, 0, 0.4)',
    headerBg: 'rgba(255, 255, 255, 0.04)',
    headerBorderBottom: 'rgba(255, 255, 255, 0.08)',
    iconContainerBg: 'rgba(255, 255, 255, 0.08)',
    iconContainerBorder: 'rgba(255, 255, 255, 0.1)',
    textPrimary: '#f1f5f9',
    textSecondary: 'rgba(255, 255, 255, 0.45)',
} as const;

// ============ Props ============

interface ComponentNodeProps {
    node: CanvasNode;
    isSelected: boolean;
    onSelect: (id: string, multi: boolean) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
    onPortClick: (nodeId: string) => void;
    isConnecting: boolean;
    /** When connecting, the type of the source node (for validation) */
    connectingSourceType?: CanvasComponentType;
    /** When connecting, the source node id (don't connect to self) */
    connectingSourceNodeId?: string;
    /** Callback when port hover changes (for invalid target tooltip) */
    onPortHoverChange?: (message: string | null) => void;
    // Simulation overlay data (undefined = no simulation active)
    simState?: NodeSimSummary;
    isSpof?: boolean;
    // Diagnostic click handler (opens diagnostics dialog)
    onDiagnosticClick?: () => void;
    /** Topology warnings for this node (badge) */
    topologyWarnings?: TopologyWarning[];
    /** Brief red border tint when cache eviction/flush fires (from store flashNodeId) */
    flashEffect?: boolean;
    /** Called when user double-clicks to open internals in right panel */
    onEnterInternals?: (nodeId: string) => void;
    /** When true, node is not draggable and ports do not start/finish connection (view-only) */
    readOnly?: boolean;
}

// ============ Component ============

export default function ComponentNode({
    node,
    isSelected,
    onSelect,
    onDragEnd,
    onPortClick,
    isConnecting,
    connectingSourceType,
    connectingSourceNodeId,
    onPortHoverChange,
    simState,
    isSpof,
    onDiagnosticClick,
    topologyWarnings = [],
    flashEffect = false,
    onEnterInternals,
    readOnly = false,
}: ComponentNodeProps) {
    const groupRef = useRef<Konva.Group>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredPort, setHoveredPort] = useState<string | null>(null);

    const catalog = getCatalogEntry(node.type);
    const icon = catalog?.icon || '❓';

    const { width, height } = node;
    const cornerRadius = 14;

    // Category-based border and glow (no health on border)
    const categoryColor = CATEGORY_BORDER_COLORS[node.type] ?? CATEGORY_BORDER_COLORS.default;
    const borderColor = isSelected ? SELECTED_STROKE : categoryColor;
    const shadowColor = isSelected ? SELECTED_SHADOW_COLOR : categoryColor;
    const shadowBlur = isSelected ? 28 : 16;
    const shadowOpacity = isSelected ? 0.7 : 0.45;

    // Health color for dot only (when sim active)
    const healthDotColor = simState
        ? !simState.isHealthy
            ? HEALTH_COLORS.critical
            : simState.avgCpuPercent > 60
                ? HEALTH_COLORS.warning
                : HEALTH_COLORS.healthy
        : null;
    const healthStatus: 'healthy' | 'warning' | 'critical' = simState
        ? !simState.isHealthy
            ? 'critical'
            : simState.avgCpuPercent > 60
                ? 'warning'
                : 'healthy'
        : 'healthy';

    // Pulse opacity for health dot when warning/critical (cleanup on unmount)
    const [pulseOpacity, setPulseOpacity] = useState(1);
    useEffect(() => {
        if (healthStatus !== 'warning' && healthStatus !== 'critical') return;
        const interval = setInterval(() => {
            setPulseOpacity((prev) => (prev === 1 ? 0.6 : 1));
        }, 800);
        return () => clearInterval(interval);
    }, [healthStatus]);

    // Header height (top ~40% of card)
    const headerHeight = height * 0.4;

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

    const handleDblClick = useCallback(
        (e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            onSelect(node.id, false);
            onEnterInternals?.(node.id);
        },
        [node.id, onSelect, onEnterInternals],
    );

    const handleDblTap = useCallback(
        (e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true;
            onSelect(node.id, false);
            onEnterInternals?.(node.id);
        },
        [node.id, onSelect, onEnterInternals],
    );

    const handleDragEnd = useCallback(
        (e: Konva.KonvaEventObject<DragEvent>) => {
            onDragEnd(node.id, e.target.x(), e.target.y());
        },
        [node.id, onDragEnd],
    );

    const isValidConnectionTarget =
        !(isConnecting && node.id === connectingSourceNodeId) &&
        (!isConnecting ||
            !connectingSourceType ||
            validateConnection(connectingSourceType, node.type).valid);

    const handlePortEnter = useCallback(
        (portId: string) => {
            setHoveredPort(portId);
            if (onPortHoverChange && !isValidConnectionTarget) {
                const result = validateConnection(connectingSourceType!, node.type);
                onPortHoverChange(`${result.message}. ${result.suggestion ?? ''}`);
            }
        },
        [onPortHoverChange, isValidConnectionTarget, connectingSourceType, node.type],
    );

    const handlePortLeave = useCallback(() => {
        setHoveredPort(null);
        onPortHoverChange?.(null);
    }, [onPortHoverChange]);

    const handlePortClick = useCallback(
        (e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            if (!readOnly) onPortClick(node.id);
        },
        [node.id, onPortClick, readOnly],
    );

    const handlePortTap = useCallback(
        (e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true;
            if (!readOnly) onPortClick(node.id);
        },
        [node.id, onPortClick, readOnly],
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

    const showMetricsFooter = !!(
        simState &&
        ((simState as NodeDetailMetrics)?.currentRps ?? 0) > 0
    );
    const footerHeight = 24;
    const cpuBarY = showMetricsFooter ? height - footerHeight - 6 : height - 6;
    const scalingBadgeY = showMetricsFooter ? height - footerHeight - 20 : height - 20;

    return (
        <Group
            ref={groupRef}
            x={node.x}
            y={node.y}
            draggable={!readOnly}
            onClick={handleClick}
            onTap={handleTap}
            onDblClick={handleDblClick}
            onDblTap={handleDblTap}
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
            {/* Main body — glassmorphism (must listen so Group receives click/drag) */}
            <Rect
                width={width}
                height={height}
                fill={GLASS.bg}
                stroke={borderColor}
                strokeWidth={isSelected ? 2.5 : 2}
                cornerRadius={cornerRadius}
                shadowColor={shadowColor}
                shadowBlur={shadowBlur}
                shadowOpacity={shadowOpacity}
                shadowOffset={{ x: 0, y: 0 }}
            />
            {/* Eviction flash — red border tint when cache evict/flush fires */}
            {flashEffect && (
                <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill="transparent"
                    stroke="#ef4444"
                    strokeWidth={3}
                    cornerRadius={cornerRadius}
                    listening={false}
                />
            )}
            {/* Inset top highlight (no CSS backdrop-filter on canvas) */}
            <Rect
                x={1}
                y={1}
                width={width - 2}
                height={1}
                fill="rgba(255, 255, 255, 0.08)"
                cornerRadius={[cornerRadius - 1, cornerRadius - 1, 0, 0]}
                listening={false}
            />
            {/* Status bar — 2px top edge with category color when sim active */}
            {simState && (
                <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={2}
                    fill={categoryColor}
                    cornerRadius={[cornerRadius, cornerRadius, 0, 0]}
                    listening={false}
                />
            )}
            {/* Header section (top ~40%) */}
            <Rect
                x={0}
                y={0}
                width={width}
                height={headerHeight}
                fill={GLASS.headerBg}
                cornerRadius={[cornerRadius, cornerRadius, 0, 0]}
                listening={false}
            />
            <Line
                points={[0, headerHeight, width, headerHeight]}
                stroke={GLASS.headerBorderBottom}
                strokeWidth={1}
                listening={false}
            />
            {/* Icon container — 4px padding, 20px icon */}
            <Rect
                x={8}
                y={height / 2 - 14}
                width={28}
                height={28}
                fill={GLASS.iconContainerBg}
                stroke={GLASS.iconContainerBorder}
                strokeWidth={1}
                cornerRadius={8}
                listening={false}
            />
            {/* Icon */}
            <Text
                text={icon}
                x={12}
                y={height / 2 - 10}
                fontSize={20}
                listening={false}
            />

            {/* Label */}
            <Text
                text={node.name}
                x={42}
                y={14}
                fontSize={11}
                fontFamily="Inter, system-ui, sans-serif"
                fontStyle="600"
                fill={GLASS.textPrimary}
                lineHeight={1.2}
                width={width - 54}
                ellipsis
                wrap="none"
                listening={false}
            />

            {/* Subtitle (type) */}
            <Text
                text={catalog?.description?.split('—')[0]?.trim() || node.type}
                x={42}
                y={27}
                fontSize={9}
                fontFamily="Inter, system-ui, sans-serif"
                fill={GLASS.textSecondary}
                lineHeight={1.2}
                width={width - 54}
                ellipsis
                wrap="none"
                listening={false}
            />

            {/* Health dot — top-right inside card, only when sim active */}
            {simState && healthDotColor && (
                <Circle
                    x={width - 10}
                    y={8}
                    radius={5}
                    fill={healthDotColor}
                    opacity={healthStatus === 'warning' || healthStatus === 'critical' ? pulseOpacity : 1}
                    shadowColor={healthDotColor}
                    shadowBlur={10}
                    shadowOpacity={0.8}
                    listening={false}
                />
            )}

            {/* Expand hint — bottom-right of card body, decorative */}
            <Text
                text="⊞"
                x={width - 16}
                y={height - (showMetricsFooter ? footerHeight + 14 : 14)}
                fontSize={9}
                fontFamily="Inter, system-ui, sans-serif"
                fill="rgba(255,255,255,0.2)"
                listening={false}
            />
            {/* Scaling badge — replica count with category color */}
            {node.sharedConfig.scaling && node.sharedConfig.scaling.instances > 1 && (
                <Group x={width - 28} y={scalingBadgeY}>
                    <Rect
                        width={20}
                        height={16}
                        fill={categoryColor + '26'}
                        stroke={categoryColor + '66'}
                        strokeWidth={1}
                        cornerRadius={4}
                        listening={false}
                    />
                    <Text
                        text={`×${node.sharedConfig.scaling.instances}`}
                        x={3}
                        y={2}
                        fontSize={10}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill={categoryColor}
                        listening={false}
                    />
                </Group>
            )}

            {/* Chaos indicator badge — top-left */}
            {node.sharedConfig.chaos && Object.keys(node.sharedConfig.chaos).length > 0 && (
                <Group x={-8} y={-8}>
                    <Rect
                        width={24}
                        height={16}
                        fill="#7f1d1d"
                        stroke="#ef4444"
                        strokeWidth={1}
                        cornerRadius={4}
                    />
                    <Text
                        text="🔥"
                        x={5}
                        y={2}
                        fontSize={10}
                        listening={false}
                    />
                </Group>
            )}

            {/* ── Simulation Overlays ── */}

            {/* SPOF badge — above card top edge */}
            {isSpof && (
                <Group
                    x={width - 42}
                    y={-18}
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

            {/* Topology warning badge — above card, below SPOF or alone */}
            {topologyWarnings.length > 0 && (() => {
                const hasCritical = topologyWarnings.some((w) => w.severity === 'critical');
                const label = hasCritical ? 'CRITICAL' : 'WARNING';
                const fill = hasCritical ? '#ef4444' : '#f59e0b';
                const badgeY = isSpof ? -2 : -18;
                return (
                    <Group x={width - 52} y={badgeY}>
                        <Rect width={52} height={16} fill={fill} cornerRadius={4} />
                        <Text
                            text={label}
                            x={3}
                            y={2}
                            fontSize={8}
                            fontFamily="Inter, system-ui, sans-serif"
                            fontStyle="700"
                            fill="#000"
                            listening={false}
                        />
                    </Group>
                );
            })()}

            {/* Latency badge — bottom-center (hidden when metrics footer is shown) */}
            {simState && !showMetricsFooter && (
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

            {/* CPU utilization bar — above metrics footer when present */}
            {simState && (
                <>
                    {/* Background bar */}
                    <Rect
                        x={8}
                        y={cpuBarY}
                        width={width - 16}
                        height={3}
                        fill="#1e293b"
                        cornerRadius={1}
                    />
                    {/* Fill bar */}
                    <Rect
                        x={8}
                        y={cpuBarY}
                        width={cpuBarWidth}
                        height={3}
                        fill={cpuBarColor}
                        cornerRadius={1}
                    />
                </>
            )}

            {/* Metrics footer — RPS + Latency when sim active and currentRps > 0 */}
            {showMetricsFooter && simState && (
                <Group x={0} y={height - footerHeight}>
                    <Rect
                        width={width}
                        height={footerHeight}
                        fill="rgba(0, 0, 0, 0.25)"
                        listening={false}
                    />
                    <Line
                        points={[0, 0, width, 0]}
                        stroke="rgba(255, 255, 255, 0.06)"
                        strokeWidth={1}
                        listening={false}
                    />
                    <Text
                        text="RPS"
                        x={10}
                        y={4}
                        fontSize={8}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill="#94a3b8"
                        listening={false}
                    />
                    <Text
                        text={Math.round((simState as NodeDetailMetrics)?.currentRps ?? 0).toString()}
                        x={28}
                        y={4}
                        fontSize={11}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill="#f1f5f9"
                        listening={false}
                    />
                    <Text
                        text="LAT"
                        x={width - 52}
                        y={4}
                        fontSize={8}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill="#94a3b8"
                        listening={false}
                    />
                    <Text
                        text={simState.avgLatencyMs != null ? `${Math.round(simState.avgLatencyMs)}ms` : '—'}
                        x={width - 38}
                        y={4}
                        fontSize={11}
                        fontFamily="Inter, system-ui, sans-serif"
                        fill={latencyColor(simState.avgLatencyMs)}
                        listening={false}
                    />
                </Group>
            )}

            {/* Ports — visible on hover or when connecting */}
            {(isHovered || isConnecting) &&
                ports.map((port) => {
                    const isInvalidTarget = isConnecting && !isValidConnectionTarget;
                    return (
                        <Circle
                            key={port.id}
                            x={port.x}
                            y={port.y}
                            radius={hoveredPort === port.id ? PORT_RADIUS + 2 : PORT_RADIUS}
                            fill={
                                isInvalidTarget
                                    ? hoveredPort === port.id
                                        ? '#f87171'
                                        : '#64748b'
                                    : hoveredPort === port.id
                                        ? PORT_HOVER_COLOR
                                        : PORT_COLOR
                            }
                            opacity={isInvalidTarget ? 0.8 : 1}
                            stroke="#1e293b"
                            strokeWidth={2}
                            onMouseEnter={() => handlePortEnter(port.id)}
                            onMouseLeave={handlePortLeave}
                            onClick={handlePortClick}
                            onTap={handlePortTap}
                        />
                    );
                })}
        </Group>
    );
}

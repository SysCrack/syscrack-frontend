/**
 * Connection — renders a bezier curve between two nodes on the canvas.
 * 
 * Handles selection, hover effects, protocol coloring, labels,
 * and request particles flowing along the path during live simulation.
 */
'use client';

import { Group, Line, Text, Circle } from 'react-konva';
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type Konva from 'konva';
import type { CanvasConnection, CanvasNode } from '@/lib/types/canvas';
import type { RequestParticle } from '@/lib/simulation/SimulationRunner';

// ============ Protocol Colors ============

const PROTOCOL_COLORS: Record<string, string> = {
    http: '#3b82f6',
    grpc: '#22c55e',
    websocket: '#eab308',
    tcp: '#a855f7',
    udp: '#ef4444',
    custom: '#64748b',
};

// ============ Bezier math ============

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function bezierPoint(pts: number[], t: number): { x: number; y: number } {
    return {
        x: cubicBezier(pts[0], pts[2], pts[4], pts[6], t),
        y: cubicBezier(pts[1], pts[3], pts[5], pts[7], t),
    };
}

// ============ Props ============

interface ConnectionProps {
    connection: CanvasConnection;
    sourceNode: CanvasNode;
    targetNode: CanvasNode;
    isSelected: boolean;
    onSelect: (id: string) => void;
    // Simulation overlay
    simActive?: boolean;
    simHealthy?: boolean;
    // Live particles on this connection (driven by SimulationRunner)
    particles?: RequestParticle[];
    // Node metrics for tooltip (target node utilization)
    targetNodeMetrics?: { avgCpuPercent: number; avgLatencyMs: number; avgErrorRate: number; isHealthy: boolean };
    // Hover callbacks for tooltip
    onHover?: (connectionId: string | null) => void;
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

/** Particle radius scales with request count */
function particleRadius(count: number): number {
    if (count <= 1) return 3;
    if (count <= 10) return 4;
    if (count <= 100) return 5;
    return 6;
}

// Trail config (fade trail behind each particle)
const TRAIL_LENGTH = 6;
const TRAIL_OPACITY_START = 0.4;
const TRAIL_OPACITY_END = 0;
const TRAIL_SIZE_FACTOR = 0.6;
const MIN_RADIUS_FOR_TRAIL = 3;

// Directional pulse (dash animation)
const PULSE_DASH = [4, 20] as [number, number];
const PULSE_DASH_LENGTH = 24;
const PULSE_SPEED_PX_PER_SEC = 60;

// ============ Component ============

export default function Connection({
    connection,
    sourceNode,
    targetNode,
    isSelected,
    onSelect,
    simActive,
    simHealthy,
    particles,
    targetNodeMetrics,
    onHover,
}: ConnectionProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [dashOffset, setDashOffset] = useState(0);
    const trailRef = useRef<Map<string, Array<{ x: number; y: number }>>>(new Map());

    const baseColor = PROTOCOL_COLORS[connection.protocol] || PROTOCOL_COLORS.custom;
    const color = simActive
        ? (simHealthy ? '#22d3ee' : '#f87171')
        : baseColor;

    const { points, midX, midY } = useMemo(() => {
        const sc = getNodeCenter(sourceNode);
        const tc = getNodeCenter(targetNode);
        const sp = getEdgePoint(sc, tc, sourceNode.width, sourceNode.height);
        const tp = getEdgePoint(tc, sc, targetNode.width, targetNode.height);

        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;

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

    // Directional pulse: animate dash offset only when sim is active and tab is visible
    useEffect(() => {
        if (!simActive) return;
        let rafId: number;
        let lastTime = 0;
        const animate = (time: number) => {
            if (document.visibilityState !== 'visible') {
                lastTime = 0;
                rafId = requestAnimationFrame(animate);
                return;
            }
            const deltaMs = lastTime ? time - lastTime : 0;
            lastTime = time;
            setDashOffset((prev) => {
                let next = prev - (PULSE_SPEED_PX_PER_SEC * deltaMs) / 1000;
                while (next < 0) next += PULSE_DASH_LENGTH;
                return next;
            });
            rafId = requestAnimationFrame(animate);
        };
        rafId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafId);
    }, [simActive]);

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

    // Has live particles on this connection?
    const hasParticles = particles && particles.length > 0;

    // Trail map cleanup: remove entries for particles that no longer exist (avoid unbounded memory)
    const currentParticleIds = useMemo(
        () => (particles ? new Set(particles.map((p) => p.id)) : new Set<string>()),
        [particles],
    );
    const trailMap = trailRef.current;
    if (hasParticles && currentParticleIds.size >= 0) {
        for (const id of trailMap.keys()) {
            if (!currentParticleIds.has(id)) trailMap.delete(id);
        }
    }

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
                onMouseEnter={() => {
                    setIsHovered(true);
                    onHover?.(connection.id);
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                    onHover?.(null);
                }}
            />

            {/* Visible line */}
            <Line
                points={points}
                bezier
                stroke={isSelected ? '#60a5fa' : color}
                strokeWidth={isSelected ? 2.5 : 2}
                opacity={isSelected ? 1 : simActive ? 0.9 : isHovered ? 1 : 0.85}
                dash={connection.protocol === 'websocket' ? [8, 4] : undefined}
                listening={false}
            />

            {/* Directional pulse — dashed line animating source → target (only when sim active and visible) */}
            {simActive && (
                <Line
                    points={points}
                    bezier
                    stroke="rgba(255, 255, 255, 0.28)"
                    strokeWidth={1.5}
                    opacity={0.35}
                    dash={PULSE_DASH}
                    dashOffset={dashOffset}
                    listening={false}
                />
            )}

            {/* Live request particles — with fade trail (trail drawn first so particle is on top) */}
            {hasParticles &&
                particles!.map((p) => {
                    const pos = bezierPoint(points, Math.min(p.t, 0.99));
                    const radius = particleRadius(p.count);
                    const showTrail = radius >= MIN_RADIUS_FOR_TRAIL;

                    if (showTrail) {
                        let trail = trailMap.get(p.id);
                        if (!trail) {
                            trail = [];
                            trailMap.set(p.id, trail);
                        }
                        trail.unshift({ x: pos.x, y: pos.y });
                        if (trail.length > TRAIL_LENGTH) trail.pop();
                    }

                    return (
                        <Group key={p.id}>
                            {showTrail &&
                                trailMap.get(p.id)?.map((tp, i) => {
                                    const opacity =
                                        TRAIL_OPACITY_START * (1 - i / TRAIL_LENGTH) + TRAIL_OPACITY_END * (i / TRAIL_LENGTH);
                                    const trailRadius =
                                        radius * TRAIL_SIZE_FACTOR * (1 - i / TRAIL_LENGTH);
                                    return (
                                        <Circle
                                            key={`${p.id}-${i}`}
                                            x={tp.x}
                                            y={tp.y}
                                            radius={Math.max(0.5, trailRadius)}
                                            fill={p.color}
                                            opacity={opacity}
                                            listening={false}
                                        />
                                    );
                                })}
                            <Circle
                                x={pos.x}
                                y={pos.y}
                                radius={radius}
                                fill={p.color}
                                opacity={0.9}
                                listening={false}
                            />
                        </Group>
                    );
                })}

            {/* Protocol dot at midpoint (hidden during sim — particles replace it) */}
            {!simActive && (
                <Circle
                    x={midX}
                    y={midY}
                    radius={isHovered || isSelected ? 6 : 4}
                    fill={color}
                    stroke="#0f172a"
                    strokeWidth={2}
                    listening={false}
                />
            )}

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

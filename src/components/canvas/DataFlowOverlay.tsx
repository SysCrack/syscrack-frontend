'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useFlowAnimation, PROTOCOL_COLORS, BOTTLENECK_COLOR } from '@/lib/hooks/useFlowAnimation';
import '@/styles/flow-animations.css';

interface ConnectionPath {
    id: string;
    protocol: string;
    startX: number;
    startY: number;
    points: [number, number][];
    throughputQps?: number;
}

interface DataFlowOverlayProps {
    connections: ConnectionPath[];
    viewportTransform: {
        scrollX: number;
        scrollY: number;
        zoom: number;
    };
    width: number;
    height: number;
}

interface Particle {
    id: string;
    connectionId: string;
    progress: number; // 0 to 1
    speed: number;
}

export function DataFlowOverlay({
    connections,
    viewportTransform,
    width,
    height
}: DataFlowOverlayProps) {
    const { isPlaying, speed, bottleneckComponents, connectionHealth, connectionReasons } = useFlowAnimation();
    const [particles, setParticles] = useState<Particle[]>([]);
    const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const animationRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    const prevConnIdsRef = useRef<string>('');

    // Initialize particles for each connection
    useEffect(() => {
        const currentIds = connections.map(c => c.id).sort().join(',');
        if (currentIds === prevConnIdsRef.current && particles.length > 0) return;

        prevConnIdsRef.current = currentIds;

        if (connections.length === 0) {
            setParticles([]);
            return;
        }

        const newParticles: Particle[] = [];
        connections.forEach((conn) => {
            // Create 3-5 particles per connection based on throughput
            const particleCount = Math.min(5, Math.max(2, Math.floor((conn.throughputQps || 100) / 500)));
            for (let i = 0; i < particleCount; i++) {
                newParticles.push({
                    id: `${conn.id}-${i}`,
                    connectionId: conn.id,
                    progress: i / particleCount, // Evenly distributed
                    speed: 0.3 + Math.random() * 0.2, // Slight variation
                });
            }
        });
        setParticles(newParticles);
    }, [connections, particles.length]);

    // Animation loop
    useEffect(() => {
        if (!isPlaying || particles.length === 0) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            return;
        }

        const animate = (timestamp: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const delta = (timestamp - lastTimeRef.current) / 1000; // Convert to seconds
            lastTimeRef.current = timestamp;

            setParticles((prev) =>
                prev.map((particle) => ({
                    ...particle,
                    progress: (particle.progress + particle.speed * speed * delta) % 1,
                }))
            );

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isPlaying, speed, particles.length]);

    // Get particle position along a connection path (supporting multiple points)
    const getParticlePosition = useCallback(
        (particle: Particle) => {
            const conn = connections.find((c) => c.id === particle.connectionId);
            if (!conn || !conn.points || conn.points.length < 2) return null;

            const { scrollX, scrollY, zoom } = viewportTransform;
            const points = conn.points;

            // Calculate total length
            let totalLength = 0;
            const segmentLengths: number[] = [];
            for (let i = 0; i < points.length - 1; i++) {
                const dx = points[i + 1][0] - points[i][0];
                const dy = points[i + 1][1] - points[i][1];
                const len = Math.sqrt(dx * dx + dy * dy);
                segmentLengths.push(len);
                totalLength += len;
            }

            if (totalLength === 0) return null;

            const targetLength = particle.progress * totalLength;
            let currentLength = 0;
            let segmentIndex = 0;

            for (let i = 0; i < segmentLengths.length; i++) {
                if (currentLength + segmentLengths[i] >= targetLength) {
                    segmentIndex = i;
                    break;
                }
                currentLength += segmentLengths[i];
                segmentIndex = i;
            }

            const segmentProgress = (targetLength - currentLength) / (segmentLengths[segmentIndex] || 1);
            const p1 = points[segmentIndex];
            const p2 = points[segmentIndex + 1];

            // Linear interpolation within the segment
            const relX = p1[0] + (p2[0] - p1[0]) * segmentProgress;
            const relY = p1[1] + (p2[1] - p1[1]) * segmentProgress;

            const x = (conn.startX + relX + scrollX) * zoom;
            const y = (conn.startY + relY + scrollY) * zoom;

            return { x, y };
        },
        [connections, viewportTransform]
    );

    const getProtocolColor = (protocol: string, connectionId?: string) => {
        if (connectionId && connectionHealth[connectionId]) {
            switch (connectionHealth[connectionId]) {
                case 'good': return '#22c55e'; // Vibrant Green
                case 'stressed': return '#f59f00'; // Vibrant Amber
                case 'failed': return '#ef4444'; // Vibrant Red
            }
        }
        return PROTOCOL_COLORS[protocol.toLowerCase()]?.color || '#3b82f6';
    };

    const getProtocolGlow = (protocol: string, connectionId?: string) => {
        if (connectionId && connectionHealth[connectionId]) {
            switch (connectionHealth[connectionId]) {
                case 'good': return 'rgba(34, 197, 94, 0.5)';
                case 'stressed': return 'rgba(245, 159, 0, 0.5)';
                case 'failed': return 'rgba(239, 68, 68, 0.5)';
            }
        }
        return PROTOCOL_COLORS[protocol.toLowerCase()]?.glow || 'rgba(107, 114, 128, 0.5)';
    };

    const hasResults = Object.keys(connectionHealth).length > 0;
    if (!isPlaying && !hasResults && particles.length === 0) {
        return null;
    }

    return (
        <div className="absolute inset-0 pointer-events-none z-30 gpu-accelerated">
            <svg
                className="absolute inset-0 pointer-events-auto gpu-accelerated"
                width={width}
                height={height}
                style={{ overflow: 'visible', willChange: 'contents' }}
            >
                <defs>
                    {/* Glow filter for particles */}
                    <filter id="particleGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Bottleneck pulse animation */}
                    <filter id="bottleneckPulse">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Connection paths (subtle lines) */}
                {(isPlaying || hasResults) && connections.map((conn) => {
                    const { scrollX, scrollY, zoom } = viewportTransform;
                    if (!conn.points || conn.points.length < 2) return null;

                    const pointsStr = conn.points
                        .map(p => `${(conn.startX + p[0] + scrollX) * zoom},${(conn.startY + p[1] + scrollY) * zoom}`)
                        .join(' ');

                    const hasHealth = !!connectionHealth[conn.id];
                    const color = getProtocolColor(conn.protocol, conn.id);

                    return (
                        <g key={`group-${conn.id}`}>
                            {/* Invisible thicker hit area for easier hovering */}
                            <polyline
                                points={pointsStr}
                                fill="none"
                                stroke="transparent"
                                strokeWidth={20}
                                style={{ pointerEvents: 'stroke', cursor: connectionReasons[conn.id] ? 'help' : 'default' }}
                                onMouseEnter={() => setHoveredConnId(conn.id)}
                                onMouseLeave={() => setHoveredConnId(null)}
                                onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                            />
                            <polyline
                                key={`path-${conn.id}`}
                                points={pointsStr}
                                fill="none"
                                stroke={color}
                                strokeWidth={hasHealth ? 4 : 2}
                                strokeOpacity={hasHealth ? 0.7 : 0.3}
                                strokeDasharray={hasHealth ? "" : "8 4"}
                                style={{
                                    filter: hasHealth ? 'drop-shadow(0 0 4px ' + color + '44)' : 'none',
                                    pointerEvents: 'none'
                                }}
                                className="transition-all duration-700"
                            />
                        </g>
                    );
                })}

                {/* Animated particles */}
                {isPlaying && particles.map((particle) => {
                    const pos = getParticlePosition(particle);
                    if (!pos) return null;

                    const conn = connections.find((c) => c.id === particle.connectionId);
                    const hasHealth = conn ? !!connectionHealth[conn.id] : false;
                    const color = conn ? getProtocolColor(conn.protocol, conn.id) : '#6b7280';
                    const glow = conn ? getProtocolGlow(conn.protocol, conn.id) : 'rgba(107, 114, 128, 0.5)';

                    return (
                        <g key={particle.id} className="gpu-accelerated animate-pulse-glow" style={{ willChange: 'transform, opacity' }}>
                            {/* Outer Glow */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={hasHealth ? 10 : 8}
                                fill={glow}
                                opacity={0.4}
                            />
                            {/* Middle Glow */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={hasHealth ? 6 : 5}
                                fill={color}
                                opacity={0.3}
                                filter="url(#particleGlow)"
                            />
                            {/* Particle core */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={hasHealth ? 4 : 3.5}
                                fill="white"
                                stroke={color}
                                strokeWidth={2}
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip */}
            {hoveredConnId && connectionReasons[hoveredConnId] && (
                <div
                    className="fixed pointer-events-none z-[100] px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-lg shadow-xl max-w-xs animate-in fade-in zoom-in duration-200"
                    style={{
                        left: mousePos.x + 15,
                        top: mousePos.y + 15,
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}
                >
                    <div className="flex items-start gap-2">
                        <span className="mt-0.5">⚠️</span>
                        <span>{connectionReasons[hoveredConnId]}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DataFlowOverlay;

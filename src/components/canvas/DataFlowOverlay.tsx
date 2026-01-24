'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useFlowAnimation, PROTOCOL_COLORS, BOTTLENECK_COLOR } from '@/lib/hooks/useFlowAnimation';

interface ConnectionPath {
    id: string;
    protocol: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
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
    const { isPlaying, speed, bottleneckComponents } = useFlowAnimation();
    const [particles, setParticles] = useState<Particle[]>([]);
    const animationRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    // Initialize particles for each connection
    useEffect(() => {
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
    }, [connections]);

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

    // Get particle position along a connection path
    const getParticlePosition = useCallback(
        (particle: Particle) => {
            const conn = connections.find((c) => c.id === particle.connectionId);
            if (!conn) return null;

            const { scrollX, scrollY, zoom } = viewportTransform;

            // Linear interpolation along the path
            const x = (conn.startX + (conn.endX - conn.startX) * particle.progress + scrollX) * zoom;
            const y = (conn.startY + (conn.endY - conn.startY) * particle.progress + scrollY) * zoom;

            return { x, y };
        },
        [connections, viewportTransform]
    );

    const getProtocolColor = (protocol: string) => {
        return PROTOCOL_COLORS[protocol.toLowerCase()]?.color || '#6b7280';
    };

    const getProtocolGlow = (protocol: string) => {
        return PROTOCOL_COLORS[protocol.toLowerCase()]?.glow || 'rgba(107, 114, 128, 0.5)';
    };

    if (!isPlaying && particles.length === 0) {
        return null;
    }

    return (
        <svg
            className="absolute inset-0 pointer-events-none z-30"
            width={width}
            height={height}
            style={{ overflow: 'visible' }}
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
            {isPlaying && connections.map((conn) => {
                const { scrollX, scrollY, zoom } = viewportTransform;
                const x1 = (conn.startX + scrollX) * zoom;
                const y1 = (conn.startY + scrollY) * zoom;
                const x2 = (conn.endX + scrollX) * zoom;
                const y2 = (conn.endY + scrollY) * zoom;
                const color = getProtocolColor(conn.protocol);

                return (
                    <line
                        key={`path-${conn.id}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={color}
                        strokeWidth={2}
                        strokeOpacity={0.3}
                        strokeDasharray="8 4"
                    />
                );
            })}

            {/* Animated particles */}
            {isPlaying && particles.map((particle) => {
                const pos = getParticlePosition(particle);
                if (!pos) return null;

                const conn = connections.find((c) => c.id === particle.connectionId);
                const color = conn ? getProtocolColor(conn.protocol) : '#6b7280';
                const glow = conn ? getProtocolGlow(conn.protocol) : 'rgba(107, 114, 128, 0.5)';

                return (
                    <g key={particle.id}>
                        {/* Glow effect */}
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={8}
                            fill={glow}
                            opacity={0.6}
                        />
                        {/* Particle core */}
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={4}
                            fill={color}
                            filter="url(#particleGlow)"
                        />
                    </g>
                );
            })}
        </svg>
    );
}

export default DataFlowOverlay;

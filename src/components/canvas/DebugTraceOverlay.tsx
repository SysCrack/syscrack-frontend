'use client';

/**
 * Debug Trace Overlay Component
 * 
 * Renders animated request particles flowing through the system design
 * based on debug trace data. Shows cache hits, errors, and request paths.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDebugTraceStore } from '@/stores/debugTraceStore';
import { useDesignStore } from '@/stores/designStore';
import '@/styles/flow-animations.css';

interface DebugTraceOverlayProps {
    viewportTransform: {
        scrollX: number;
        scrollY: number;
        zoom: number;
    };
    width: number;
    height: number;
}

// Color scheme for particles
const PARTICLE_COLORS = {
    in_flight: { fill: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },      // Blue
    processing: { fill: '#f59e0b', glow: 'rgba(245, 158, 11, 0.6)' },     // Amber
    cache_hit: { fill: '#22c55e', glow: 'rgba(34, 197, 94, 0.6)' },       // Green
    completed: { fill: '#10b981', glow: 'rgba(16, 185, 129, 0.6)' },      // Emerald
    failed: { fill: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)' },          // Red
};

export function DebugTraceOverlay({
    viewportTransform,
    width,
    height
}: DebugTraceOverlayProps) {
    const {
        isAnimating,
        particles,
        activeComponentIds,
        cacheHitComponentIds,
        errorComponentIds,
        traceResult,
        updateAnimationFrame,
        requestsProcessed,
        playbackSpeed,
    } = useDebugTraceStore();

    const elements = useDesignStore((state) => state.elements);
    const animationRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);

    // Build component position map from Excalidraw elements
    const componentPositions = useCallback(() => {
        const positions: Map<string, { x: number; y: number; width: number; height: number }> = new Map();

        elements.forEach((el: any) => {
            if (el.type === 'rectangle' && el.customData?.componentId) {
                positions.set(el.customData.componentId, {
                    x: el.x + (el.width || 100) / 2,
                    y: el.y + (el.height || 60) / 2,
                    width: el.width || 100,
                    height: el.height || 60,
                });
            }
        });

        return positions;
    }, [elements]);

    // Animation loop
    useEffect(() => {
        if (!isAnimating) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            return;
        }

        const animate = (timestamp: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = timestamp;
            const delta = timestamp - lastTimeRef.current;
            lastTimeRef.current = timestamp;

            updateAnimationFrame(delta);
            animationRef.current = requestAnimationFrame(animate);
        };

        lastTimeRef.current = 0;
        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isAnimating, updateAnimationFrame]);

    // Get canvas position for a component
    const getComponentCanvasPos = useCallback((componentId: string) => {
        const positions = componentPositions();
        const pos = positions.get(componentId);
        if (!pos) return null;

        const { scrollX, scrollY, zoom } = viewportTransform;
        return {
            x: (pos.x + scrollX) * zoom,
            y: (pos.y + scrollY) * zoom,
            width: pos.width * zoom,
            height: pos.height * zoom,
        };
    }, [componentPositions, viewportTransform]);

    // Interpolate position between two components
    const getParticlePosition = useCallback((
        sourceId: string,
        targetId: string,
        progress: number
    ) => {
        const sourcePos = getComponentCanvasPos(sourceId);
        const targetPos = getComponentCanvasPos(targetId);

        if (!sourcePos || !targetPos) return null;

        return {
            x: sourcePos.x + (targetPos.x - sourcePos.x) * progress,
            y: sourcePos.y + (targetPos.y - sourcePos.y) * progress,
        };
    }, [getComponentCanvasPos]);

    if (!traceResult || particles.length === 0) {
        return null;
    }

    const activeParticles = particles.filter(
        p => p.status !== 'completed' && p.status !== 'failed'
    );

    return (
        <div className="absolute inset-0 pointer-events-none z-40 gpu-accelerated">
            <svg
                width={width}
                height={height}
                style={{ overflow: 'visible', willChange: 'contents' }}
                className="gpu-accelerated"
            >
                <defs>
                    {/* Particle glow filter */}
                    <filter id="debugParticleGlow" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Cache hit burst effect */}
                    <filter id="cacheHitGlow" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="8" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Error pulse */}
                    <filter id="errorPulse" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Component highlights */}
                {Array.from(activeComponentIds).map(componentId => {
                    const pos = getComponentCanvasPos(componentId);
                    if (!pos) return null;

                    const isCacheHit = cacheHitComponentIds.has(componentId);
                    const isError = errorComponentIds.has(componentId);

                    return (
                        <g key={`highlight-${componentId}`}>
                            {/* Active indicator ring */}
                            <rect
                                x={pos.x - pos.width / 2 - 4}
                                y={pos.y - pos.height / 2 - 4}
                                width={pos.width + 8}
                                height={pos.height + 8}
                                fill="none"
                                stroke={isError ? '#ef4444' : isCacheHit ? '#22c55e' : '#3b82f6'}
                                strokeWidth={3}
                                rx={8}
                                opacity={0.8}
                                filter={isError ? 'url(#errorPulse)' : isCacheHit ? 'url(#cacheHitGlow)' : undefined}
                                className="animate-pulse"
                            />

                            {/* Cache hit badge */}
                            {isCacheHit && (
                                <g transform={`translate(${pos.x + pos.width / 2 - 8}, ${pos.y - pos.height / 2 - 8})`}>
                                    <circle
                                        cx={0}
                                        cy={0}
                                        r={12}
                                        fill="#22c55e"
                                        filter="url(#cacheHitGlow)"
                                    />
                                    <text
                                        x={0}
                                        y={1}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontSize={10}
                                        fontWeight="bold"
                                    >
                                        ⚡
                                    </text>
                                </g>
                            )}

                            {/* Error badge */}
                            {isError && (
                                <g transform={`translate(${pos.x + pos.width / 2 - 8}, ${pos.y - pos.height / 2 - 8})`}>
                                    <circle
                                        cx={0}
                                        cy={0}
                                        r={12}
                                        fill="#ef4444"
                                        filter="url(#errorPulse)"
                                        className="animate-ping"
                                    />
                                    <text
                                        x={0}
                                        y={1}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontSize={12}
                                        fontWeight="bold"
                                    >
                                        ✕
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {/* Request particles */}
                {activeParticles.map(particle => {
                    const pos = getParticlePosition(
                        particle.sourceComponentId,
                        particle.targetComponentId,
                        particle.progress
                    );

                    if (!pos) return null;

                    const colors = PARTICLE_COLORS[particle.status] || PARTICLE_COLORS.in_flight;
                    const size = particle.status === 'processing' ? 8 : 6;

                    return (
                        <g key={particle.id} filter="url(#debugParticleGlow)" className="gpu-accelerated animate-pulse-glow" style={{ willChange: 'transform, opacity' }}>
                            {/* Outer glow */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={size + 4}
                                fill={colors.glow}
                                opacity={0.5}
                            />
                            {/* Particle body */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={size}
                                fill={colors.fill}
                            />
                            {/* Inner highlight */}
                            <circle
                                cx={pos.x - 1}
                                cy={pos.y - 1}
                                r={size / 3}
                                fill="white"
                                opacity={0.6}
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Stats overlay */}
            {isAnimating && (
                <div className="absolute top-4 left-4 bg-black/80 text-white px-4 py-2 rounded-lg text-sm font-mono">
                    <div className="flex items-center gap-4">
                        <span className="text-blue-400">⬤</span>
                        <span>{activeParticles.length} requests in flight</span>
                        <span className="text-gray-400">|</span>
                        <span>{requestsProcessed} / {traceResult?.total_requests || 0} completed</span>
                        <span className="text-gray-400">|</span>
                        <span>{playbackSpeed}x speed</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DebugTraceOverlay;

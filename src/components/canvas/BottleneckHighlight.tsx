'use client';

import { useEffect, useState } from 'react';
import { useFlowAnimation, BOTTLENECK_COLOR } from '@/lib/hooks/useFlowAnimation';
import { AlertTriangle } from 'lucide-react';

interface BottleneckComponent {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    utilizationPercent: number;
}

interface BottleneckHighlightProps {
    components: BottleneckComponent[];
    viewportTransform: {
        scrollX: number;
        scrollY: number;
        zoom: number;
    };
    width: number;
    height: number;
}

export function BottleneckHighlight({
    components,
    viewportTransform,
    width,
    height,
}: BottleneckHighlightProps) {
    const { bottleneckComponents, isPlaying } = useFlowAnimation();
    const [pulsePhase, setPulsePhase] = useState(0);

    // Pulse animation
    useEffect(() => {
        if (bottleneckComponents.length === 0) return;

        const interval = setInterval(() => {
            setPulsePhase((prev) => (prev + 1) % 100);
        }, 50);

        return () => clearInterval(interval);
    }, [bottleneckComponents.length]);

    const bottlenecks = components.filter((c) =>
        bottleneckComponents.includes(c.id)
    );

    if (bottlenecks.length === 0) {
        return null;
    }

    const { scrollX, scrollY, zoom } = viewportTransform;
    const pulseOpacity = 0.3 + 0.4 * Math.sin((pulsePhase / 100) * Math.PI * 2);
    const pulseScale = 1 + 0.05 * Math.sin((pulsePhase / 100) * Math.PI * 2);

    return (
        <svg
            className="absolute inset-0 pointer-events-none z-20"
            width={width}
            height={height}
            style={{ overflow: 'visible' }}
        >
            <defs>
                {/* Pulsing glow filter */}
                <filter id="bottleneckGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feFlood floodColor={BOTTLENECK_COLOR} result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {bottlenecks.map((comp) => {
                const x = (comp.x + scrollX) * zoom;
                const y = (comp.y + scrollY) * zoom;
                const w = comp.width * zoom;
                const h = comp.height * zoom;

                return (
                    <g key={comp.id}>
                        {/* Pulsing border */}
                        <rect
                            x={x - 4}
                            y={y - 4}
                            width={w + 8}
                            height={h + 8}
                            fill="none"
                            stroke={BOTTLENECK_COLOR}
                            strokeWidth={3}
                            strokeOpacity={pulseOpacity}
                            rx={8}
                            filter="url(#bottleneckGlow)"
                            transform={`scale(${pulseScale})`}
                            style={{ transformOrigin: `${x + w / 2}px ${y + h / 2}px` }}
                        />

                        {/* Warning badge */}
                        <g transform={`translate(${x + w - 10}, ${y - 10})`}>
                            <circle r={12} fill={BOTTLENECK_COLOR} />
                            <text
                                x={0}
                                y={4}
                                textAnchor="middle"
                                fill="white"
                                fontSize={14}
                                fontWeight="bold"
                            >
                                !
                            </text>
                        </g>

                        {/* Tooltip on hover area (invisible) */}
                        <rect
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            fill="transparent"
                            className="pointer-events-auto cursor-pointer"
                        >
                            <title>
                                {`Bottleneck: ${comp.name}\n${comp.utilizationPercent}% capacity reached`}
                            </title>
                        </rect>
                    </g>
                );
            })}
        </svg>
    );
}

export default BottleneckHighlight;

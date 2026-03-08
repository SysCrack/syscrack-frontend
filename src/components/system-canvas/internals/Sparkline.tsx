/**
 * Sparkline — SVG polyline + gradient fill for queue depth / time series.
 * gradientId must be unique per usage (e.g. spark-${nodeId}).
 */
'use client';

export interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    gradientId: string;
}

export default function Sparkline({
    data,
    width = 288,
    height = 48,
    color = '#3b82f6',
    gradientId,
}: SparklineProps) {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (v / max) * height;
        return `${x},${y}`;
    });
    const polylinePoints = points.join(' ');
    const polygonPoints = `0,${height} ${polylinePoints} ${width},${height}`;

    return (
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <polygon points={polygonPoints} fill={`url(#${gradientId})`} />
            <polyline
                points={polylinePoints}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                opacity={0.8}
            />
        </svg>
    );
}

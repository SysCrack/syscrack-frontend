/**
 * Hook for managing data flow animation state
 * Controls playback, speed, and bottleneck highlighting
 */
import { create } from 'zustand';

export interface FlowAnimationState {
    isPlaying: boolean;
    speed: number; // 0.5, 1, 2
    bottleneckComponents: string[];
    activeConnections: string[];
    connectionHealth: Record<string, 'good' | 'stressed' | 'failed'>;
    connectionReasons: Record<string, string>;

    // Actions
    play: () => void;
    pause: () => void;
    toggle: () => void;
    setSpeed: (speed: number) => void;
    setBottlenecks: (componentIds: string[]) => void;
    setActiveConnections: (connectionIds: string[]) => void;
    setConnectionHealth: (healthMap: Record<string, 'good' | 'stressed' | 'failed'>) => void;
    setConnectionReasons: (reasonsMap: Record<string, string>) => void;
    reset: () => void;
}

export const useFlowAnimation = create<FlowAnimationState>((set) => ({
    isPlaying: false,
    speed: 1,
    bottleneckComponents: [],
    activeConnections: [],
    connectionHealth: {},
    connectionReasons: {},

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setSpeed: (speed) => set({ speed }),
    setBottlenecks: (componentIds) => set({ bottleneckComponents: componentIds }),
    setActiveConnections: (connectionIds) => set({ activeConnections: connectionIds }),
    setConnectionHealth: (healthMap) => set({ connectionHealth: healthMap }),
    setConnectionReasons: (reasonsMap) => set({ connectionReasons: reasonsMap }),
    reset: () => set({
        isPlaying: false,
        speed: 1,
        bottleneckComponents: [],
        activeConnections: [],
        connectionHealth: {},
        connectionReasons: {},
    }),
}));

// Protocol color mapping
export const PROTOCOL_COLORS: Record<string, { color: string; glow: string }> = {
    http: { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.5)' },
    https: { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.5)' },
    grpc: { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)' },
    websocket: { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.5)' },
    amqp: { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.5)' },
    kafka_wire: { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.5)' },
    sql: { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.5)' },
    redis: { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.5)' },
    s3: { color: '#f97316', glow: 'rgba(249, 115, 22, 0.5)' },
    tcp: { color: '#6b7280', glow: 'rgba(107, 114, 128, 0.5)' },
    udp: { color: '#6b7280', glow: 'rgba(107, 114, 128, 0.5)' },
};

export const BOTTLENECK_COLOR = '#ef4444';

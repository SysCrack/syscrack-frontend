/**
 * Store for managing debug trace animation state
 * 
 * Handles step-by-step playback of request traces on the canvas.
 * Works alongside useFlowAnimation for visualization.
 */
import { create } from 'zustand';
import type { DebugTraceResponse } from '@/lib/api/designs';

interface TraceHop {
    component_id: string;
    component_name: string;
    component_type: string;
    arrival_time_ms: number;
    processing_time_ms: number;
    departure_time_ms: number;
    status: string;
    cache_hit: boolean;
    error_message: string | null;
}

interface TracedRequest {
    request_id: string;
    start_time_ms: number;
    end_time_ms: number;
    total_latency_ms: number;
    status: string;
    hops: TraceHop[];
}

// A request particle for animation
interface RequestParticle {
    id: string;
    requestId: string;
    currentHopIndex: number;
    progress: number; // 0-1 within current hop transition
    status: 'in_flight' | 'processing' | 'completed' | 'failed' | 'cache_hit';
    sourceComponentId: string;
    targetComponentId: string;
}

interface DebugTraceState {
    // Data
    traceResult: DebugTraceResponse | null;

    // Animation state
    isAnimating: boolean;
    currentTime: number; // Simulation time in ms
    playbackSpeed: number; // 1x, 2x, 4x, 8x

    // Active particles being animated
    particles: RequestParticle[];

    // Currently active components (lit up)
    activeComponentIds: Set<string>;

    // Cache hit indicators
    cacheHitComponentIds: Set<string>;

    // Error indicators
    errorComponentIds: Set<string>;

    // Stats
    requestsProcessed: number;

    // Actions
    setTraceResult: (result: DebugTraceResponse | null) => void;
    startAnimation: () => void;
    pauseAnimation: () => void;
    stopAnimation: () => void;
    setPlaybackSpeed: (speed: number) => void;
    updateAnimationFrame: (deltaMs: number) => void;
    reset: () => void;
}

export const useDebugTraceStore = create<DebugTraceState>((set, get) => ({
    // Initial state
    traceResult: null,
    isAnimating: false,
    currentTime: 0,
    playbackSpeed: 1,
    particles: [],
    activeComponentIds: new Set(),
    cacheHitComponentIds: new Set(),
    errorComponentIds: new Set(),
    requestsProcessed: 0,

    setTraceResult: (result) => {
        // Initialize particles from trace result
        const particles: RequestParticle[] = [];

        if (result && result.traces.length > 0) {
            // Create a particle for each request
            result.traces.forEach((trace, idx) => {
                if (trace.hops.length >= 2) {
                    particles.push({
                        id: `particle-${idx}`,
                        requestId: trace.request_id,
                        currentHopIndex: 0,
                        progress: 0,
                        status: 'in_flight',
                        sourceComponentId: trace.hops[0].component_id,
                        targetComponentId: trace.hops[1]?.component_id || trace.hops[0].component_id,
                    });
                }
            });
        }

        set({
            traceResult: result,
            particles,
            currentTime: 0,
            requestsProcessed: 0,
            activeComponentIds: new Set(),
            cacheHitComponentIds: new Set(),
            errorComponentIds: new Set(),
        });
    },

    startAnimation: () => set({ isAnimating: true }),

    pauseAnimation: () => set({ isAnimating: false }),

    stopAnimation: () => {
        set({
            isAnimating: false,
            currentTime: 0,
            requestsProcessed: 0,
            activeComponentIds: new Set(),
            cacheHitComponentIds: new Set(),
            errorComponentIds: new Set(),
        });
    },

    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    updateAnimationFrame: (deltaMs) => {
        const state = get();
        if (!state.isAnimating || !state.traceResult) return;

        const scaledDelta = deltaMs * state.playbackSpeed;
        const newTime = state.currentTime + scaledDelta;

        const newActiveIds = new Set<string>();
        const newCacheHitIds = new Set<string>();
        const newErrorIds = new Set<string>();
        let processed = state.requestsProcessed;

        const updatedParticles = state.particles.map(particle => {
            const trace = state.traceResult?.traces.find(t => t.request_id === particle.requestId);
            if (!trace) return particle;

            // Scale trace times for visible animation (1ms trace = 50ms animation)
            const timeScale = 50;
            const scaledTraceStart = trace.start_time_ms * timeScale;

            // Check if request should be active
            if (newTime < scaledTraceStart) {
                // Not started yet
                return particle;
            }

            const currentHop = trace.hops[particle.currentHopIndex];
            const nextHop = trace.hops[particle.currentHopIndex + 1];

            if (!currentHop) {
                // Request completed
                if (particle.status !== 'completed' && particle.status !== 'failed') {
                    processed++;
                }
                return {
                    ...particle,
                    status: (trace.status === 'completed' ? 'completed' : 'failed') as RequestParticle['status'],
                };
            }

            // Calculate position in current hop transition
            const hopArrivalTime = scaledTraceStart + (currentHop.arrival_time_ms * timeScale);
            const hopDepartureTime = scaledTraceStart + (currentHop.departure_time_ms * timeScale);

            // Mark current component as active
            newActiveIds.add(currentHop.component_id);

            // Check for cache hit
            if (currentHop.cache_hit) {
                newCacheHitIds.add(currentHop.component_id);
            }

            // Check for error
            if (currentHop.status === 'error') {
                newErrorIds.add(currentHop.component_id);
            }

            // Processing phase
            if (newTime >= hopArrivalTime && newTime < hopDepartureTime) {
                return {
                    ...particle,
                    status: (currentHop.cache_hit ? 'cache_hit' : 'processing') as RequestParticle['status'],
                    progress: 0.5, // Parked at component
                };
            }

            // Transition to next hop
            if (newTime >= hopDepartureTime && nextHop) {
                const nextArrivalTime = scaledTraceStart + (nextHop.arrival_time_ms * timeScale);
                const transitionDuration = nextArrivalTime - hopDepartureTime;
                const transitionProgress = Math.min(1, (newTime - hopDepartureTime) / transitionDuration);

                if (transitionProgress >= 1) {
                    // Move to next hop
                    const nextNextHop = trace.hops[particle.currentHopIndex + 2];
                    return {
                        ...particle,
                        currentHopIndex: particle.currentHopIndex + 1,
                        progress: 0,
                        status: 'in_flight' as const,
                        sourceComponentId: nextHop.component_id,
                        targetComponentId: nextNextHop?.component_id || nextHop.component_id,
                    };
                }

                return {
                    ...particle,
                    progress: transitionProgress,
                    status: 'in_flight' as const,
                    sourceComponentId: currentHop.component_id,
                    targetComponentId: nextHop.component_id,
                };
            }

            return particle;
        });

        // Check if all requests are done
        const allDone = updatedParticles.every(
            p => p.status === 'completed' || p.status === 'failed'
        );

        set({
            currentTime: newTime,
            particles: updatedParticles,
            activeComponentIds: newActiveIds,
            cacheHitComponentIds: newCacheHitIds,
            errorComponentIds: newErrorIds,
            requestsProcessed: processed,
            isAnimating: !allDone,
        });
    },

    reset: () => set({
        traceResult: null,
        isAnimating: false,
        currentTime: 0,
        playbackSpeed: 1,
        particles: [],
        activeComponentIds: new Set(),
        cacheHitComponentIds: new Set(),
        errorComponentIds: new Set(),
        requestsProcessed: 0,
    }),
}));

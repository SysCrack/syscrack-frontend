/**
 * Store for managing debug trace animation state
 * 
 * Handles step-by-step playback of request traces on the canvas.
 * Works alongside useFlowAnimation for visualization.
 */
import { create } from 'zustand';
import type { DebugTraceResponse } from '@/lib/api/designs';

type ParticleStatus = 'in_flight' | 'processing' | 'completed' | 'failed' | 'cache_hit';

// A request particle for animation
interface RequestParticle {
    id: string;
    requestId: string;
    currentHopIndex: number;
    progress: number; // 0-1 within current hop transition
    status: ParticleStatus;
    sourceComponentId: string;
    targetComponentId: string;
    startDelay: number; // Stagger start times
}

interface DebugTraceState {
    // Data
    traceResult: DebugTraceResponse | null;

    // Animation state
    isAnimating: boolean;
    currentTime: number; // Animation time in ms
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
            // Create a particle for each request with staggered start times
            result.traces.forEach((trace, idx) => {
                if (trace.hops.length >= 1) {
                    const firstHop = trace.hops[0];
                    const secondHop = trace.hops[1] || trace.hops[0];

                    particles.push({
                        id: `particle-${idx}`,
                        requestId: trace.request_id,
                        currentHopIndex: 0,
                        progress: 0,
                        status: 'in_flight',
                        sourceComponentId: firstHop.component_id,
                        targetComponentId: secondHop.component_id,
                        // Stagger starts: each request starts 100ms apart (scaled by playback)
                        startDelay: idx * 100,
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

        // Animation timing constants
        const HOP_TRAVEL_TIME = 800; // ms to travel between components
        const HOP_PROCESS_TIME = 400; // ms to show "processing" at component

        const updatedParticles = state.particles.map(particle => {
            // Check if this particle should start yet (stagger)
            if (newTime < particle.startDelay) {
                return particle;
            }

            // Already finished
            if (particle.status === 'completed' || particle.status === 'failed') {
                return particle;
            }

            const trace = state.traceResult?.traces.find(t => t.request_id === particle.requestId);
            if (!trace) return particle;

            const particleTime = newTime - particle.startDelay;
            const totalHops = trace.hops.length;

            // Calculate which hop we're on based on elapsed time
            const timePerHop = HOP_TRAVEL_TIME + HOP_PROCESS_TIME;
            const totalDuration = totalHops * timePerHop;

            // Check if completed
            if (particleTime >= totalDuration) {
                // Particle reached end - increment processed count
                processed++;
                return {
                    ...particle,
                    status: (trace.status === 'completed' ? 'completed' : 'failed') as ParticleStatus,
                    progress: 1,
                };
            }

            // Calculate current hop index and phase
            const currentHopIndex = Math.min(
                Math.floor(particleTime / timePerHop),
                totalHops - 1
            );
            const timeInHop = particleTime % timePerHop;

            const currentHop = trace.hops[currentHopIndex];
            const nextHop = trace.hops[currentHopIndex + 1];

            if (!currentHop) {
                return particle;
            }

            // Mark component active
            newActiveIds.add(currentHop.component_id);

            // Check for cache hit
            if (currentHop.cache_hit) {
                newCacheHitIds.add(currentHop.component_id);
            }

            // Check for error
            if (currentHop.status === 'error') {
                newErrorIds.add(currentHop.component_id);
            }

            // Determine phase: traveling or processing
            if (timeInHop < HOP_TRAVEL_TIME) {
                // Traveling to this hop
                const travelProgress = timeInHop / HOP_TRAVEL_TIME;
                return {
                    ...particle,
                    currentHopIndex,
                    progress: travelProgress,
                    status: 'in_flight' as ParticleStatus,
                    sourceComponentId: currentHopIndex > 0
                        ? trace.hops[currentHopIndex - 1].component_id
                        : currentHop.component_id,
                    targetComponentId: currentHop.component_id,
                };
            } else {
                // Processing at this hop
                return {
                    ...particle,
                    currentHopIndex,
                    progress: 0.5, // Parked
                    status: currentHop.cache_hit ? 'cache_hit' as ParticleStatus : 'processing' as ParticleStatus,
                    sourceComponentId: currentHop.component_id,
                    targetComponentId: nextHop?.component_id || currentHop.component_id,
                };
            }
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

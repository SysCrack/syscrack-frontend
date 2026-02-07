'use client';

/**
 * Debug Trace Controls Component
 * 
 * Provides play/pause, speed controls, and stats for debug trace animation.
 */

import { Play, Pause, SkipForward, Square, Zap } from 'lucide-react';
import { useDebugTraceStore } from '@/stores/debugTraceStore';

export function DebugTraceControls() {
    const {
        isAnimating,
        traceResult,
        playbackSpeed,
        requestsProcessed,
        particles,
        startAnimation,
        pauseAnimation,
        stopAnimation,
        setPlaybackSpeed,
        reset,
    } = useDebugTraceStore();

    if (!traceResult) {
        return null;
    }

    const activeCount = particles.filter(
        p => p.status !== 'completed' && p.status !== 'failed'
    ).length;

    const progress = traceResult.total_requests > 0
        ? Math.round((requestsProcessed / traceResult.total_requests) * 100)
        : 0;

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-4">
                {/* Play/Pause */}
                <button
                    onClick={() => isAnimating ? pauseAnimation() : startAnimation()}
                    className="p-2 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white transition-colors"
                    title={isAnimating ? 'Pause' : 'Play'}
                >
                    {isAnimating ? (
                        <Pause className="h-5 w-5" />
                    ) : (
                        <Play className="h-5 w-5 fill-current" />
                    )}
                </button>

                {/* Stop */}
                <button
                    onClick={stopAnimation}
                    className="p-2 rounded-lg bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors"
                    title="Stop & Reset"
                >
                    <Square className="h-5 w-5" />
                </button>

                {/* Divider */}
                <div className="h-8 w-px bg-[var(--color-border)]" />

                {/* Speed Controls */}
                <div className="flex items-center gap-1">
                    {[1, 2, 4, 8].map(speed => (
                        <button
                            key={speed}
                            onClick={() => setPlaybackSpeed(speed)}
                            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${playbackSpeed === speed
                                    ? 'bg-[var(--color-primary)] text-white'
                                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                                }`}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-[var(--color-border)]" />

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-[var(--color-text-secondary)]">
                            {activeCount} active
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-[var(--color-text-tertiary)]">
                            {requestsProcessed}/{traceResult.total_requests}
                        </span>
                        <span className="text-[var(--color-primary)] font-medium">
                            {progress}%
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-24 h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-[var(--color-border)]" />

                {/* Close */}
                <button
                    onClick={reset}
                    className="p-2 rounded-lg hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    title="Close Debug Trace"
                >
                    ✕
                </button>
            </div>

            {/* Legend */}
            <div className="mt-2 flex justify-center gap-4 text-xs text-[var(--color-text-tertiary)]">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> In Flight
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Processing
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> Cache Hit
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Error
                </span>
            </div>
        </div>
    );
}

export default DebugTraceControls;

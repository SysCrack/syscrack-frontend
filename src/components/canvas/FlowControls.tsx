'use client';

import { Play, Pause, FastForward, RotateCcw } from 'lucide-react';
import { useFlowAnimation } from '@/lib/hooks/useFlowAnimation';

interface FlowControlsProps {
    className?: string;
}

export function FlowControls({ className = '' }: FlowControlsProps) {
    const { isPlaying, speed, play, pause, toggle, setSpeed, reset } = useFlowAnimation();

    const speedOptions = [0.5, 1, 2];

    return (
        <div
            className={`flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-bg)] rounded-lg border border-[var(--color-border)] shadow-lg ${className}`}
        >
            {/* Play/Pause Button */}
            <button
                onClick={toggle}
                className={`
          p-2 rounded-lg transition-colors
          ${isPlaying
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }
        `}
                title={isPlaying ? 'Pause animation' : 'Play animation'}
            >
                {isPlaying ? (
                    <Pause className="h-4 w-4" />
                ) : (
                    <Play className="h-4 w-4" />
                )}
            </button>

            {/* Speed Controls */}
            <div className="flex items-center gap-1 px-2 border-l border-[var(--color-border)]">
                <FastForward className="h-3 w-3 text-[var(--color-text-tertiary)]" />
                {speedOptions.map((s) => (
                    <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={`
              px-2 py-1 text-xs font-medium rounded transition-colors
              ${speed === s
                                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                            }
            `}
                    >
                        {s}x
                    </button>
                ))}
            </div>

            {/* Reset Button */}
            <button
                onClick={reset}
                className="p-2 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors border-l border-[var(--color-border)]"
                title="Reset animation"
            >
                <RotateCcw className="h-4 w-4" />
            </button>

            {/* Status indicator */}
            {isPlaying && (
                <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--color-border)]">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-[var(--color-text-tertiary)]">Live</span>
                </div>
            )}
        </div>
    );
}

export default FlowControls;

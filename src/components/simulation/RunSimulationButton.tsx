'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Loader2, AlertCircle } from 'lucide-react';
import { useDesignStore } from '@/stores/designStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { useFlowAnimation } from '@/lib/hooks/useFlowAnimation';
import * as simulationsApi from '@/lib/api/simulations';
import { SimulationStatus } from '@/lib/types/design';

export function RunSimulationButton() {
    // Design Store
    const currentDesignId = useDesignStore((state) => state.currentDesignId);
    const isDirty = useDesignStore((state) => state.isDirty);
    const isSaving = useDesignStore((state) => state.isSaving);

    // Simulation Store
    const isRunning = useSimulationStore((state) => state.isRunning);
    const progress = useSimulationStore((state) => state.progress);
    const startSimulation = useSimulationStore((state) => state.startSimulation);
    const updateProgress = useSimulationStore((state) => state.updateProgress);
    const setResults = useSimulationStore((state) => state.setResults);
    const setError = useSimulationStore((state) => state.setError);

    // Local polling ref
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const handleRun = async () => {
        if (!currentDesignId || isRunning) return;

        try {
            // 1. Start Simulation Request
            const response = await simulationsApi.runSimulation(currentDesignId, {
                scenarios: [], // Run all default scenarios
            });

            startSimulation(response.job_id);

            // 2. Start Polling
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await simulationsApi.getSimulationStatus(response.job_id);

                    if (statusRes.status === SimulationStatus.COMPLETED) {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        setResults(
                            statusRes.results || [],
                            statusRes.total_score || 0,
                            statusRes.grading_result || undefined,
                            statusRes.estimation_comparison || undefined
                        );
                        // Start flow animation after successful simulation
                        useFlowAnimation.getState().play();
                    } else if (statusRes.status === SimulationStatus.FAILED) {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        setError(statusRes.error || 'Simulation failed');
                    } else {
                        // Running/Pending
                        // Calculate progress based on completed scenarios vs total
                        // Or use a fake progress increment if API doesn't provide %
                        // API returns `results` array even in progress? Usually not until done.
                        // We can increment progress artificially or based on log steps if available.
                        // For now, just show "Running..."
                        // If backend provided progress % we'd use it.
                        // Let's increment locally up to 90%
                        updateProgress(Math.min(90, (useSimulationStore.getState().progress || 0) + 5));
                    }
                } catch (pollErr) {
                    console.error('Poll error:', pollErr);
                    // Don't stop polling immediately on transient network error, but maybe limit retries?
                    // For now, assume critical fail if poll fails repeatedly.
                }
            }, 1000);

        } catch (err) {
            console.error('Failed to start simulation:', err);
            setError(err instanceof Error ? err.message : 'Failed to start');
        }
    };

    // Derived states
    const isDisabled = !currentDesignId || isDirty || isSaving || isRunning;
    const buttonText = isRunning ? `Running ${progress}%` : isSaving ? 'Saving...' : isDirty ? 'Unsaved' : 'Run Simulation';

    return (
        <div className="flex items-center gap-2">
            {/* Warning if trying to run while dirty (though disabled, tooltip helps) */}
            {isDirty && !isSaving && (
                <span className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Save first
                </span>
            )}

            <button
                onClick={handleRun}
                disabled={isDisabled}
                className={`
                    flex items-center gap-2 px-5 py-2.5 rounded-lg shadow-sm
                    text-sm font-medium transition-all
                    ${isDisabled
                        ? 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)] border border-[var(--color-border)] cursor-not-allowed'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white shadow-md hover:shadow-lg'
                    }
                `}
            >
                {isRunning || isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Play className="h-4 w-4 fill-current" />
                )}
                {buttonText}
            </button>
        </div>
    );
}

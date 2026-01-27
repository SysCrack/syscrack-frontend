'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useDesignStore } from '@/stores/designStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { useFlowAnimation } from '@/lib/hooks/useFlowAnimation';
import * as simulationsApi from '@/lib/api/simulations';
import * as designsApi from '@/lib/api/designs';
import { SimulationStatus, type UserEstimates } from '@/lib/types/design';
import { parseExcalidrawScene, type ParsedDesign } from '@/lib/utils/sceneParser';
import { EstimationModal } from './EstimationModal';

type ButtonState = 'idle' | 'validating' | 'saving' | 'running' | 'disabled';

interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export function RunSimulationButton() {
    // Design Store
    const currentDesignId = useDesignStore((state) => state.currentDesignId);
    const elements = useDesignStore((state) => state.elements);
    const isDirty = useDesignStore((state) => state.isDirty);
    const isSaving = useDesignStore((state) => state.isSaving);

    // Simulation Store
    const isRunning = useSimulationStore((state) => state.isRunning);
    const progress = useSimulationStore((state) => state.progress);
    const startSimulation = useSimulationStore((state) => state.startSimulation);
    const updateProgress = useSimulationStore((state) => state.updateProgress);
    const setResults = useSimulationStore((state) => state.setResults);
    const setError = useSimulationStore((state) => state.setError);
    const setUserEstimates = useSimulationStore((state) => state.setUserEstimates);

    // Local state
    const [buttonState, setButtonState] = useState<ButtonState>('idle');
    const [isEstimationModalOpen, setIsEstimationModalOpen] = useState(false);


    // Update button state based on external states
    useEffect(() => {
        if (isRunning) {
            setButtonState('running');
        } else if (isSaving) {
            setButtonState('saving');
        } else if (!currentDesignId || isDirty) {
            setButtonState('disabled');
        } else {
            setButtonState('idle');
        }
    }, [isRunning, isSaving, currentDesignId, isDirty]);

    /**
     * Local validation before API call
     */
    const validateLocally = useCallback((parsed: ParsedDesign): ValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for components
        if (parsed.components.length === 0) {
            errors.push('No components found. Add at least one component to your design.');
        }

        // Check for connections
        if (parsed.connections.length === 0 && parsed.components.length > 1) {
            warnings.push('No connections found. Connect your components with arrows.');
        }

        // Check for entry point
        if (!parsed.entryPoint && parsed.components.length > 0) {
            const hasClient = parsed.components.some(c => c.type === 'client');
            if (!hasClient) {
                warnings.push('No client component found. Consider adding a client as the entry point.');
            }
        }

        // Add parsed warnings
        warnings.push(...parsed.warnings);

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }, []);

    /**
     * Main simulation flow
     */
    const handleRun = async () => {
        if (!currentDesignId || isRunning || buttonState !== 'idle') return;

        try {
            // Step 1: Parse current scene (if elements are in store)
            let localValidation: ValidationResult | null = null;
            if (elements.length > 0) {
                setButtonState('validating');
                const parsed = parseExcalidrawScene(elements);
                localValidation = validateLocally(parsed);

                // Show local validation errors
                if (!localValidation.valid) {
                    localValidation.errors.forEach(err => {
                        toast.error('Validation Error', { description: err });
                    });
                    setButtonState('idle');
                    return;
                }

                // Show warnings but continue
                localValidation.warnings.forEach(warn => {
                    toast.warning('Warning', { description: warn });
                });
            }

            // Step 2: Validate with backend API
            setButtonState('validating');
            const validationResponse = await designsApi.validateSavedDesign(currentDesignId);

            if (!validationResponse.valid) {
                validationResponse.errors.forEach(err => {
                    toast.error('Validation Error', { description: err.message });
                });
                setButtonState('idle');
                return;
            }

            validationResponse.warnings.forEach(warn => {
                toast.warning('Warning', { description: warn.message });
            });

            // Step 3: Open Estimation Modal
            setIsEstimationModalOpen(true);

        } catch (err) {
            console.error('Failed to run simulation:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to start simulation';
            setError(errorMessage);
            toast.error('Error', { description: errorMessage });
            setButtonState('idle');
        }
    };

    /**
     * Start the actual simulation call
     */
    const executeSimulation = async (estimates: UserEstimates | null) => {
        if (!currentDesignId) return;

        setIsEstimationModalOpen(false);
        setUserEstimates(estimates);

        try {
            // Step 4: Start simulation
            setButtonState('running');
            toast.info('Simulation Started', {
                description: 'Running scenarios...',
                icon: <Loader2 className="h-4 w-4 animate-spin" />,
            });

            const response = await simulationsApi.runSimulation(currentDesignId, {
                scenarios: [], // Run all default scenarios
                user_estimates: estimates || undefined,
            });

            startSimulation(response.job_id);

        } catch (err) {
            console.error('Failed to execute simulation:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to start simulation';
            setError(errorMessage);
            toast.error('Error', { description: errorMessage });
            setButtonState('idle');
        }
    };

    // Button text based on state
    const getButtonText = () => {
        switch (buttonState) {
            case 'validating':
                return 'Validating...';
            case 'saving':
                return 'Saving...';
            case 'running':
                return `Simulating ${progress}%`;
            case 'disabled':
                return isDirty ? 'Unsaved' : 'Run Simulation';
            default:
                return 'Run Simulation';
        }
    };

    // Tooltip based on state
    const getTooltip = () => {
        if (isDirty) return 'Save your design first to run simulation';
        if (!currentDesignId) return 'No design to simulate';
        if (isRunning) return 'Simulation in progress...';
        return 'Run simulation to test your system design';
    };

    const isDisabled = buttonState === 'disabled' || buttonState === 'validating' || buttonState === 'saving' || buttonState === 'running';
    const isLoading = buttonState === 'validating' || buttonState === 'saving' || buttonState === 'running';

    return (
        <>
            <button
                onClick={handleRun}
                disabled={isDisabled}
                className={`
                flex items-center gap-2 px-5 py-2.5 rounded-lg shadow-sm
                text-sm font-medium transition-all
                ${isDisabled
                        ? 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)] border border-[var(--color-border)] cursor-not-allowed'
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white shadow-md hover:shadow-lg cursor-pointer'
                    }
            `}
                title={getTooltip()}
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Play className="h-4 w-4 fill-current" />
                )}
                {getButtonText()}
            </button>

            <EstimationModal
                isOpen={isEstimationModalOpen}
                onClose={() => {
                    setIsEstimationModalOpen(false);
                    setButtonState('idle');
                }}
                onConfirm={executeSimulation}
            />
        </>
    );
}

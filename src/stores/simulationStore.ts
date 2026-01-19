/**
 * Zustand store for simulation state management
 */
import { create } from 'zustand';
import { SimulationStatus } from '@/lib/types/design';
import type {
    ScenarioResult,
    GradingResult,
    EstimationComparison,
} from '@/lib/types/design';

interface SimulationStore {
    // State
    isRunning: boolean;
    jobId: string | null;
    status: SimulationStatus | null;
    progress: number;
    currentScenario: string | null;
    results: ScenarioResult[] | null;
    totalScore: number | null;
    gradingResult: GradingResult | null;
    estimationComparison: EstimationComparison | null;
    error: string | null;

    // UI State
    isResultsPanelOpen: boolean;

    // Actions
    startSimulation: (jobId: string) => void;
    updateProgress: (progress: number, scenario?: string) => void;
    setResults: (results: ScenarioResult[], totalScore: number, grading?: GradingResult, estimation?: EstimationComparison) => void;
    setError: (error: string) => void;
    openResultsPanel: () => void;
    closeResultsPanel: () => void;
    reset: () => void;
}

export const useSimulationStore = create<SimulationStore>()((set) => ({
    // Initial state
    isRunning: false,
    jobId: null,
    status: null,
    progress: 0,
    currentScenario: null,
    results: null,
    totalScore: null,
    gradingResult: null,
    estimationComparison: null,
    error: null,
    isResultsPanelOpen: false,

    // Actions
    startSimulation: (jobId) => set({
        isRunning: true,
        jobId,
        status: SimulationStatus.RUNNING,
        progress: 0,
        currentScenario: null,
        results: null,
        totalScore: null,
        gradingResult: null,
        estimationComparison: null,
        error: null,
        isResultsPanelOpen: true,
    }),

    updateProgress: (progress, scenario) => set({
        progress,
        currentScenario: scenario ?? null,
    }),

    setResults: (results, totalScore, grading, estimation) => set({
        isRunning: false,
        status: SimulationStatus.COMPLETED,
        progress: 100,
        results,
        totalScore,
        gradingResult: grading ?? null,
        estimationComparison: estimation ?? null,
    }),

    setError: (error) => set({
        isRunning: false,
        status: SimulationStatus.FAILED,
        error,
    }),

    openResultsPanel: () => set({ isResultsPanelOpen: true }),

    closeResultsPanel: () => set({ isResultsPanelOpen: false }),

    reset: () => set({
        isRunning: false,
        jobId: null,
        status: null,
        progress: 0,
        currentScenario: null,
        results: null,
        totalScore: null,
        gradingResult: null,
        estimationComparison: null,
        error: null,
        isResultsPanelOpen: false,
    }),
}));

/**
 * Zustand store for simulation state management
 * 
 * Manages simulation lifecycle, progress, and results.
 * Uses immer middleware for easier state updates.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { SimulationStatus } from '@/lib/types/design';
import type {
    ScenarioResult,
    GradingResult,
    EstimationComparison,
    UserEstimates,
} from '@/lib/types/design';

interface SimulationStore {
    // State
    isRunning: boolean;
    currentJobId: string | null;
    status: SimulationStatus | null;
    progress: number;
    currentScenario: string | null;
    results: ScenarioResult[] | null;
    totalScore: number | null;
    gradingResult: GradingResult | null;
    estimationComparison: EstimationComparison | null;
    userEstimates: UserEstimates | null;
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
    setUserEstimates: (estimates: UserEstimates | null) => void;
    reset: () => void;
}

export const useSimulationStore = create<SimulationStore>()(
    immer((set) => ({
        // Initial state
        isRunning: false,
        currentJobId: null,
        status: null,
        progress: 0,
        currentScenario: null,
        results: null,
        totalScore: null,
        gradingResult: null,
        estimationComparison: null,
        userEstimates: null,
        error: null,
        isResultsPanelOpen: false,

        // Actions
        startSimulation: (jobId) => set((state) => {
            state.isRunning = true;
            state.currentJobId = jobId;
            state.status = SimulationStatus.RUNNING;
            state.progress = 0;
            state.currentScenario = null;
            state.results = null;
            state.totalScore = null;
            state.gradingResult = null;
            state.estimationComparison = null;
            state.error = null;
            state.isResultsPanelOpen = true;
        }),

        updateProgress: (progress, scenario) => set((state) => {
            state.progress = progress;
            state.currentScenario = scenario ?? null;
        }),

        setResults: (results, totalScore, grading, estimation) => set((state) => {
            state.isRunning = false;
            state.status = SimulationStatus.COMPLETED;
            state.progress = 100;
            state.results = results;
            state.totalScore = totalScore;
            state.gradingResult = grading ?? null;
            state.estimationComparison = estimation ?? null;
        }),

        setError: (error) => set((state) => {
            state.isRunning = false;
            state.status = SimulationStatus.FAILED;
            state.error = error;
        }),

        openResultsPanel: () => set((state) => {
            state.isResultsPanelOpen = true;
        }),

        closeResultsPanel: () => set((state) => {
            state.isResultsPanelOpen = false;
        }),

        setUserEstimates: (estimates) => set((state) => {
            state.userEstimates = estimates;
        }),

        reset: () => set((state) => {
            state.isRunning = false;
            state.currentJobId = null;
            state.status = null;
            state.progress = 0;
            state.currentScenario = null;
            state.results = null;
            state.totalScore = null;
            state.gradingResult = null;
            state.estimationComparison = null;
            state.userEstimates = null;
            state.error = null;
            state.isResultsPanelOpen = false;
        }),
    }))
);

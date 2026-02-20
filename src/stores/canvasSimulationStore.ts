/**
 * canvasSimulationStore — Zustand store for the live canvas simulation.
 *
 * Holds the SimulationRunner instance, particle state (updated every frame),
 * live metrics, and control actions (play/pause/speed/load).
 */
import { create } from 'zustand';
import type { SimulationOutput, SimulationDiagnostic, ScenarioResult, NodeSimSummary } from '@/lib/simulation/types';
import { SimulationEngine } from '@/lib/simulation/SimulationEngine';
import { SimulationRunner, type RequestParticle, type LiveMetrics } from '@/lib/simulation/SimulationRunner';
import { useCanvasStore } from './canvasStore';

export type CanvasSimStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

interface CanvasSimulationStore {
    status: CanvasSimStatus;
    // Static results (from full engine run)
    output: SimulationOutput | null;
    selectedScenario: number;
    error: string | null;

    // Live simulation state
    particles: RequestParticle[];
    liveMetrics: LiveMetrics | null;
    speed: number;
    loadFactor: number;
    tick: number;

    // Runner ref (not serializable, kept outside store)
    _runner: SimulationRunner | null;

    // Actions
    runSimulation: () => void;
    pauseSimulation: () => void;
    resumeSimulation: () => void;
    reset: () => void;
    selectScenario: (idx: number) => void;
    setSpeed: (s: number) => void;
    setLoadFactor: (f: number) => void;
    updateRunningSimulationNodes: () => void;
}

export const useCanvasSimulationStore = create<CanvasSimulationStore>((set, get) => ({
    status: 'idle',
    output: null,
    selectedScenario: 0,
    error: null,
    particles: [],
    liveMetrics: null,
    speed: 1,
    loadFactor: 1,
    tick: 0,
    _runner: null,

    runSimulation: () => {
        const { nodes, connections } = useCanvasStore.getState();

        if (nodes.length === 0) {
            set({ error: 'Add at least one component to simulate', status: 'error' });
            return;
        }

        // Clean up previous runner
        get()._runner?.reset();

        // Also run the static engine for the results panel
        const engine = new SimulationEngine(nodes, connections);
        const output = engine.run(60);

        // Create live runner
        const runner = new SimulationRunner(nodes, connections, (particles, metrics, tick) => {
            set({ particles, liveMetrics: metrics, tick });
        });

        runner.speed = get().speed;
        runner.loadFactor = get().loadFactor;

        set({
            status: 'running',
            output,
            selectedScenario: 0,
            error: null,
            _runner: runner,
            particles: [],
            liveMetrics: null,
            tick: 0,
        });

        runner.start();
    },

    pauseSimulation: () => {
        get()._runner?.pause();
        set({ status: 'paused' });
    },

    resumeSimulation: () => {
        const runner = get()._runner;
        if (runner) {
            runner.speed = get().speed;
            runner.loadFactor = get().loadFactor;
            runner.start();
            set({ status: 'running' });
        }
    },

    reset: () => {
        get()._runner?.reset();
        set({
            status: 'idle',
            output: null,
            selectedScenario: 0,
            error: null,
            particles: [],
            liveMetrics: null,
            tick: 0,
            _runner: null,
        });
    },

    selectScenario: (idx) => {
        set({ selectedScenario: idx });
    },

    setSpeed: (s) => {
        const runner = get()._runner;
        if (runner) runner.setSpeed(s);
        set({ speed: s });
    },

    setLoadFactor: (f) => {
        const runner = get()._runner;
        if (runner) runner.setLoadFactor(f);
        set({ loadFactor: f });
    },

    updateRunningSimulationNodes: () => {
        const runner = get()._runner;
        if (runner && (get().status === 'running' || get().status === 'paused')) {
            const { nodes } = useCanvasStore.getState();
            runner.updateNodes(nodes);
        }
    },
}));

// ── Derived selectors ──

export function useCurrentResult(): ScenarioResult | null {
    const output = useCanvasSimulationStore((s) => s.output);
    const idx = useCanvasSimulationStore((s) => s.selectedScenario);
    return output?.results[idx] ?? null;
}

export function useDiagnosticsForNode(nodeId: string): SimulationDiagnostic[] {
    const output = useCanvasSimulationStore((s) => s.output);
    const idx = useCanvasSimulationStore((s) => s.selectedScenario);
    if (!output) return [];
    const scenarioDiags = output.results[idx]?.diagnostics ?? [];
    const spofDiags = output.spofDiagnostics ?? [];
    return [...scenarioDiags, ...spofDiags].filter((d) => d.componentId === nodeId);
}

export function useNodeLiveMetrics(nodeId: string): NodeSimSummary | undefined {
    const liveMetrics = useCanvasSimulationStore((s) => s.liveMetrics);
    return liveMetrics?.nodeMetrics[nodeId];
}

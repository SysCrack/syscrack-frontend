/**
 * canvasSimulationStore — Zustand store for the live canvas simulation.
 *
 * Runs the tick loop in a Web Worker; particle state and live metrics
 * are updated via worker messages. Static engine run stays on main thread.
 */
import { create } from 'zustand';
import type { SimulationOutput, SimulationDiagnostic, ScenarioResult, NodeSimSummary, NodeDetailMetrics, RequestTrace } from '@/lib/simulation/types';
import { SimulationEngine } from '@/lib/simulation/SimulationEngine';
import type { RequestParticle, LiveMetrics } from '@/lib/simulation/SimulationRunner';
import type { WorkerTickMessage } from '@/lib/simulation/simulation.worker';
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

    // Web Worker (live simulation runs off main thread)
    _worker: Worker | null;
    _paused: boolean;

    // Step-through debug
    lastTrace: RequestTrace | null;

    // Actions
    runSimulation: () => void;
    startDebugMode: () => void;
    pauseSimulation: () => void;
    resumeSimulation: () => void;
    stepSimulation: () => void;
    injectRequest: () => void;
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
    _worker: null,
    _paused: false,
    lastTrace: null,

    runSimulation: () => {
        const { nodes, connections } = useCanvasStore.getState();

        if (nodes.length === 0) {
            set({ error: 'Add at least one component to simulate', status: 'error' });
            return;
        }

        // Terminate previous worker if any
        const prev = get()._worker;
        if (prev) prev.terminate();

        // Static engine run on main thread for results panel
        const engine = new SimulationEngine(nodes, connections);
        const output = engine.run(60);

        const speed = get().speed;
        const loadFactor = get().loadFactor;

        let worker: Worker;
        try {
            worker = new Worker(
                new URL('../lib/simulation/simulation.worker.ts', import.meta.url),
                { type: 'module' },
            );
        } catch {
            set({ error: 'Web Worker not supported', status: 'error' });
            return;
        }

        worker.onmessage = (e: MessageEvent<WorkerTickMessage | { type: 'trace'; trace: RequestTrace }>) => {
            const d = e.data;
            if (d.type === 'tick') {
                // Accept ticks when running; when paused, ticks come from step (we want those too)
                set({ particles: d.particles, liveMetrics: d.metrics, tick: d.tick });
            } else if (d.type === 'trace') {
                set({ lastTrace: d.trace });
            }
        };

        worker.postMessage({ type: 'init', nodes, connections, speed, loadFactor });
        worker.postMessage({ type: 'start' });

        set({
            status: 'running',
            output,
            selectedScenario: 0,
            error: null,
            _worker: worker,
            particles: [],
            liveMetrics: null,
            tick: 0,
            _paused: false,
            lastTrace: null,
        });
    },

    startDebugMode: () => {
        const { nodes, connections } = useCanvasStore.getState();

        if (nodes.length === 0) {
            set({ error: 'Add at least one component to debug', status: 'error' });
            return;
        }

        const prev = get()._worker;
        if (prev) prev.terminate();

        const speed = get().speed;
        const loadFactor = get().loadFactor;

        let worker: Worker;
        try {
            worker = new Worker(
                new URL('../lib/simulation/simulation.worker.ts', import.meta.url),
                { type: 'module' },
            );
        } catch {
            set({ error: 'Web Worker not supported', status: 'error' });
            return;
        }

        worker.onmessage = (e: MessageEvent<WorkerTickMessage | { type: 'trace'; trace: RequestTrace }>) => {
            const d = e.data;
            if (d.type === 'tick') {
                set({ particles: d.particles, liveMetrics: d.metrics, tick: d.tick });
            } else if (d.type === 'trace') {
                set({ lastTrace: d.trace });
            }
        };

        worker.postMessage({ type: 'init', nodes, connections, speed, loadFactor });
        // Don't send 'start' — keep the worker idle so step/inject work from a clean slate

        set({
            status: 'paused',
            output: null,
            selectedScenario: 0,
            error: null,
            _worker: worker,
            particles: [],
            liveMetrics: null,
            tick: 0,
            _paused: true,
            lastTrace: null,
        });
    },

    pauseSimulation: () => {
        set({ _paused: true });
        get()._worker?.postMessage({ type: 'pause' });
        set({ status: 'paused' });
    },

    stepSimulation: () => {
        set({ status: 'paused', _paused: true });
        get()._worker?.postMessage({ type: 'step' });
    },

    injectRequest: () => {
        get()._worker?.postMessage({ type: 'injectRequest' });
    },

    resumeSimulation: () => {
        set({ _paused: false });
        const w = get()._worker;
        if (w) {
            w.postMessage({ type: 'setSpeed', value: get().speed });
            w.postMessage({ type: 'setLoadFactor', value: get().loadFactor });
            w.postMessage({ type: 'start' });
            set({ status: 'running' });
        }
    },

    reset: () => {
        get()._worker?.terminate();
        set({
            status: 'idle',
            output: null,
            selectedScenario: 0,
            error: null,
            particles: [],
            liveMetrics: null,
            tick: 0,
            _worker: null,
            _paused: false,
            lastTrace: null,
        });
    },

    selectScenario: (idx) => {
        set({ selectedScenario: idx });
    },

    setSpeed: (s) => {
        get()._worker?.postMessage({ type: 'setSpeed', value: s });
        set({ speed: s });
    },

    setLoadFactor: (f) => {
        get()._worker?.postMessage({ type: 'setLoadFactor', value: f });
        set({ loadFactor: f });
    },

    updateRunningSimulationNodes: () => {
        const w = get()._worker;
        if (w && (get().status === 'running' || get().status === 'paused')) {
            const { nodes } = useCanvasStore.getState();
            w.postMessage({ type: 'updateNodes', nodes });
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

export function useNodeDetailMetrics(nodeId: string): NodeDetailMetrics | undefined {
    const liveMetrics = useCanvasSimulationStore((s) => s.liveMetrics);
    return liveMetrics?.nodeMetrics[nodeId] as NodeDetailMetrics | undefined;
}

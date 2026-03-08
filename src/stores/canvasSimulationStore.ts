/**
 * canvasSimulationStore — Zustand store for the live canvas simulation.
 *
 * Runs the tick loop in a Web Worker; particle state and live metrics
 * are updated via worker messages. Static engine run stays on main thread.
 */
import { create } from 'zustand';
import type { SimulationOutput, SimulationDiagnostic, ScenarioResult, NodeSimSummary, NodeDetailMetrics, RequestTrace, RequestMethod, PayloadSize } from '@/lib/simulation/types';
import type { RequestParticle, LiveMetrics } from '@/lib/simulation/SimulationRunner';
import type { WorkerTickMessage } from '@/lib/simulation/simulation.worker';
import { useCanvasStore } from './canvasStore';
import { getTemplateById } from '../lib/templates';

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
    _debugMode: boolean;

    // Step-through debug: all traces (most recent last)
    traceHistory: RequestTrace[];

    // Request filter: which particles to show (All / Reads / Writes)
    particleFilter: 'all' | 'reads' | 'writes';

    // Cache eviction flash (highlight node on canvas for 1.5s after evict/flush)
    flashNodeId: string | null;

    // Actions
    runSimulation: () => void;
    startDebugMode: () => void;
    pauseSimulation: () => void;
    resumeSimulation: () => void;
    stepSimulation: () => void;
    injectRequest: (count?: number, method?: RequestMethod, payloadSize?: PayloadSize, path?: string) => void;
    injectSequential: (count?: number, method?: RequestMethod, payloadSize?: PayloadSize, path?: string) => void;
    reset: () => void;
    selectScenario: (idx: number) => void;
    setSpeed: (s: number) => void;
    setLoadFactor: (f: number) => void;
    setParticleFilter: (f: 'all' | 'reads' | 'writes') => void;
    updateRunningSimulationNodes: () => void;
    evictCacheEntry: (nodeId: string, key: string) => void;
    flushCache: (nodeId: string) => void;
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
    _debugMode: false,
    traceHistory: [],
    particleFilter: 'all',
    flashNodeId: null,

    runSimulation: () => {
        const { nodes, connections } = useCanvasStore.getState();

        if (nodes.length === 0) {
            set({ error: 'Add at least one component to simulate', status: 'error' });
            return;
        }

        // Snapshot current controls and template before kicking off async work.
        const speed = get().speed;
        const loadFactor = get().loadFactor;
        const activeTemplateId = useCanvasStore.getState().activeTemplateId;
        const template = activeTemplateId ? getTemplateById(activeTemplateId) : undefined;
        const workloadProfile = template?.workloadProfile;

        // Lazy-load the heavy SimulationEngine so this store can be safely imported
        // in production bundles without pulling in the entire simulation stack up front.
        import('@/lib/simulation/SimulationEngine')
            .then(({ SimulationEngine }) => {
                // Terminate previous worker if any
                const prev = get()._worker;
                if (prev) prev.terminate();

                // Static engine run on main thread for results panel
                const engine = new SimulationEngine(nodes, connections);
                const output = engine.run(60);

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
                        // When paused, only accept ticks from explicit Step (fromStep); ignore stray interval ticks
                        const status = get().status;
                        if (status === 'paused' && !d.fromStep) return;
                        set({ particles: d.particles, liveMetrics: d.metrics, tick: d.tick });
                    } else if (d.type === 'trace') {
                        set((s) => ({ traceHistory: [...s.traceHistory, d.trace] }));
                    }
                };

                worker.postMessage({ type: 'init', nodes, connections, speed, loadFactor, workloadProfile });
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
                    _debugMode: false,
                    traceHistory: [],
                    flashNodeId: null,
                });
            })
            .catch((err) => {
                console.error('Failed to initialize SimulationEngine', err);
                set({ error: 'Failed to initialize simulation engine', status: 'error' });
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
        const activeTemplateId = useCanvasStore.getState().activeTemplateId;
        const template = activeTemplateId ? getTemplateById(activeTemplateId) : undefined;
        const workloadProfile = template?.workloadProfile;

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

        worker.onmessage = (e: MessageEvent<WorkerTickMessage | { type: 'trace'; trace: RequestTrace } | { type: 'injectSequentialDone' }>) => {
            const d = e.data;
            if (d.type === 'tick') {
                // In debug mode, accept all ticks (loop runs during sequential inject)
                set({ particles: d.particles, liveMetrics: d.metrics, tick: d.tick });
            } else if (d.type === 'trace') {
                set((s) => ({ traceHistory: [...s.traceHistory, d.trace] }));
            }
            // injectSequentialDone: no-op — stay in paused/debug mode
        };

        worker.postMessage({ type: 'init', nodes, connections, speed, loadFactor, workloadProfile });

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
            _debugMode: true,
            traceHistory: [],
            flashNodeId: null,
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

    injectRequest: (count = 1, method?: RequestMethod, payloadSize?: PayloadSize, path?: string) => {
        get()._worker?.postMessage({ type: 'injectRequest', count, method, payloadSize, path });
    },

    injectSequential: (count = 1, method?: RequestMethod, payloadSize?: PayloadSize, path?: string) => {
        get()._worker?.postMessage({ type: 'injectSequential', count, method, payloadSize, path });
    },

    resumeSimulation: () => {
        set({ _paused: false });
        const w = get()._worker;
        if (w) {
            if (get()._debugMode) {
                w.postMessage({ type: 'resumeDebug' });
            } else {
                w.postMessage({ type: 'setSpeed', value: get().speed });
                w.postMessage({ type: 'setLoadFactor', value: get().loadFactor });
                w.postMessage({ type: 'start' });
                set({ status: 'running' });
            }
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
            _debugMode: false,
            traceHistory: [],
            flashNodeId: null,
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

    setParticleFilter: (f) => {
        set({ particleFilter: f });
    },

    updateRunningSimulationNodes: () => {
        const w = get()._worker;
        if (w && (get().status === 'running' || get().status === 'paused')) {
            const { nodes } = useCanvasStore.getState();
            w.postMessage({ type: 'updateNodes', nodes });
        }
    },

    evictCacheEntry: (nodeId, key) => {
        get()._worker?.postMessage({ type: 'evict-cache-entry', nodeId, key });
        set({ flashNodeId: nodeId });
        setTimeout(() => {
            if (get().flashNodeId === nodeId) set({ flashNodeId: null });
        }, 1500);
    },

    flushCache: (nodeId) => {
        get()._worker?.postMessage({ type: 'flush-cache', nodeId });
        set({ flashNodeId: nodeId });
        setTimeout(() => {
            if (get().flashNodeId === nodeId) set({ flashNodeId: null });
        }, 1500);
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

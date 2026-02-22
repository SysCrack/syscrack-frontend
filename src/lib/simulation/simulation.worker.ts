/**
 * Simulation Web Worker — runs the tick loop off the main thread.
 *
 * Message protocol:
 * - To worker: init | start | pause | setSpeed | setLoadFactor | updateNodes
 * - From worker: tick { particles, metrics, tick }
 */
import type { CanvasNode, CanvasConnection } from '../types/canvas';
import { SimulationRunner } from './SimulationRunner';
import type { RequestParticle, LiveMetrics } from './SimulationRunner';
import type { RequestTrace, RequestMethod, PayloadSize } from './types';

type InMessage =
    | { type: 'init'; nodes: CanvasNode[]; connections: CanvasConnection[]; speed?: number; loadFactor?: number }
    | { type: 'start' }
    | { type: 'pause' }
    | { type: 'resumeDebug' }
    | { type: 'step' }
    | { type: 'injectRequest'; count?: number; method?: RequestMethod; payloadSize?: PayloadSize; path?: string }
    | { type: 'injectSequential'; count?: number; method?: RequestMethod; payloadSize?: PayloadSize; path?: string }
    | { type: 'setSpeed'; value: number }
    | { type: 'setLoadFactor'; value: number }
    | { type: 'updateNodes'; nodes: CanvasNode[] };

export type WorkerTickMessage = {
    type: 'tick';
    particles: RequestParticle[];
    metrics: LiveMetrics;
    tick: number;
    fromStep?: boolean;
};

export type WorkerTraceMessage = {
    type: 'trace';
    trace: RequestTrace;
};

let runner: SimulationRunner | null = null;
let lastNodes: CanvasNode[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTime = 0;
let loopActive = false;
let paused = false;
let stepInProgress = false;
const TARGET_MS = 1000 / 60; // ~60fps

function stopLoop() {
    loopActive = false;
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

function startLoop() {
    if (intervalId !== null || paused) return;
    loopActive = true;
    lastTime = performance.now();
    intervalId = setInterval(() => {
        if (!loopActive || paused || !runner?.isRunning) return;
        const now = performance.now();
        const dt = Math.min(now - lastTime, 100);
        lastTime = now;
        runner.step(dt);
    }, TARGET_MS);
}

self.onmessage = (e: MessageEvent<InMessage>) => {
    const msg = e.data;
    switch (msg.type) {
        case 'init': {
            stopLoop();
            lastNodes = msg.nodes;
            runner = new SimulationRunner(
                msg.nodes,
                msg.connections,
                (particles, metrics, tick) => {
                    const out: WorkerTickMessage = { type: 'tick', particles, metrics, tick, fromStep: stepInProgress };
                    self.postMessage(out);
                },
                {
                    onTraceComplete: (trace) => {
                        self.postMessage({ type: 'trace', trace } satisfies WorkerTraceMessage);
                    },
                },
            );
            if (typeof msg.speed === 'number') runner.setSpeed(msg.speed);
            if (typeof msg.loadFactor === 'number') runner.setLoadFactor(msg.loadFactor);
            break;
        }
        case 'start': {
            paused = false;
            if (runner) {
                runner.startForExternalLoop();
                startLoop();
            }
            break;
        }
        case 'pause': {
            paused = true;
            stopLoop();
            if (runner) {
                runner.setTraceOnlyMode(false);
                runner.pause();
            }
            break;
        }
        case 'resumeDebug': {
            paused = false;
            if (runner) {
                runner.setTraceOnlyMode(true);
                runner.startForExternalLoop();
                startLoop();
            }
            break;
        }
        case 'setSpeed': {
            if (runner) runner.setSpeed(msg.value);
            break;
        }
        case 'setLoadFactor': {
            if (runner) runner.setLoadFactor(msg.value);
            break;
        }
        case 'updateNodes': {
            lastNodes = msg.nodes;
            if (runner) runner.updateNodes(msg.nodes);
            break;
        }
        case 'step': {
            if (runner) {
                stepInProgress = true;
                runner.stepUntilNextArrival();
                stepInProgress = false;
            }
            break;
        }
        case 'injectRequest': {
            if (runner) {
                stepInProgress = true;
                const client = lastNodes.find((n) => n.type === 'client');
                const count = Math.max(1, Math.min(100, msg.count ?? 1));
                if (client) {
                    for (let i = 0; i < count; i++) {
                        runner.injectSingleRequest(client.id, msg.method, msg.payloadSize, msg.path);
                    }
                    runner.stepOnce(1, true);
                }
                stepInProgress = false;
            }
            break;
        }
        case 'injectSequential': {
            if (runner) {
                stepInProgress = true;
                const client = lastNodes.find((n) => n.type === 'client');
                const count = Math.max(1, Math.min(20, msg.count ?? 1));
                const SPACING_MS = 250;
                if (client) {
                    for (let i = 0; i < count; i++) {
                        runner.injectSingleRequest(client.id, msg.method, msg.payloadSize, msg.path);
                        if (i < count - 1) runner.stepFor(SPACING_MS);
                    }
                }
                stepInProgress = false;
                paused = false;
                runner.setTraceOnlyMode(true);
                runner.startForExternalLoop();
                self.postMessage({ type: 'injectSequentialDone' });
                startLoop();
            }
            break;
        }
        default:
            break;
    }
};

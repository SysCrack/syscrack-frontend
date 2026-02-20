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

type InMessage =
    | { type: 'init'; nodes: CanvasNode[]; connections: CanvasConnection[]; speed?: number; loadFactor?: number }
    | { type: 'start' }
    | { type: 'pause' }
    | { type: 'setSpeed'; value: number }
    | { type: 'setLoadFactor'; value: number }
    | { type: 'updateNodes'; nodes: CanvasNode[] };

export type WorkerTickMessage = {
    type: 'tick';
    particles: RequestParticle[];
    metrics: LiveMetrics;
    tick: number;
};

let runner: SimulationRunner | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTime = 0;
let loopActive = false;
const TARGET_MS = 1000 / 60; // ~60fps

function stopLoop() {
    loopActive = false;
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

function startLoop() {
    if (intervalId !== null) return;
    loopActive = true;
    lastTime = performance.now();
    intervalId = setInterval(() => {
        if (!loopActive || !runner?.isRunning) return;
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
            runner = new SimulationRunner(msg.nodes, msg.connections, (particles, metrics, tick) => {
                const out: WorkerTickMessage = { type: 'tick', particles, metrics, tick };
                self.postMessage(out);
            });
            if (typeof msg.speed === 'number') runner.setSpeed(msg.speed);
            if (typeof msg.loadFactor === 'number') runner.setLoadFactor(msg.loadFactor);
            break;
        }
        case 'start': {
            if (runner) {
                runner.startForExternalLoop();
                startLoop();
            }
            break;
        }
        case 'pause': {
            stopLoop(); // Stop interval first so no further step() runs
            if (runner) runner.pause();
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
            if (runner) runner.updateNodes(msg.nodes);
            break;
        }
        default:
            break;
    }
};

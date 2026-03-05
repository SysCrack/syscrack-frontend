import type { CanvasNode } from '@/lib/types/canvas';

const CONCURRENCY_FACTOR: Record<string, number> = {
    'io-bound': 10,
    mixed: 3,
    'cpu-bound': 1,
};

const INSTANCE_TYPE_MULTIPLIER: Record<string, number> = {
    small: 0.5,
    medium: 1.0,
    large: 2.0,
    xlarge: 4.0,
};

export class WorkerModel {
    public tasksProcessed = 0;
    public tasksErrored = 0;
    private processingLatencyAccum = 0;
    private processingLatencyCount = 0;

    constructor(private node: CanvasNode) {}

    getEffectiveThroughput(): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        const processingTimeMs = (c.processingTimeMs as number) ?? 50;
        const jobType = (c.jobType as string) ?? 'io-bound';
        const instanceType = (c.instanceType as string) ?? 'medium';
        const replicas = this.node.sharedConfig.scaling?.instances ?? 1;

        const concurrency = CONCURRENCY_FACTOR[jobType] ?? CONCURRENCY_FACTOR['mixed'];
        const typeMultiplier = INSTANCE_TYPE_MULTIPLIER[instanceType] ?? 1.0;

        // tasks/second = replicas × concurrency × (1000 / processingTimeMs) × instance-type multiplier
        return replicas * concurrency * (1000 / Math.max(processingTimeMs, 1)) * typeMultiplier;
    }

    getProcessingLatencyMs(currentQueueDepth: number, tickDurationMs: number): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        const processingTimeMs = (c.processingTimeMs as number) ?? 50;
        const throughput = this.getEffectiveThroughput();

        // Base processing time + queueing delay under saturation
        const queueingLatency =
            throughput > 0
                ? (currentQueueDepth / throughput) * 1000
                : 0;

        // Small deterministic jitter (±10%) based on node id hash, not Math.random
        const id = this.node.id || 'worker';
        const hash = id.charCodeAt(0) + (id.charCodeAt(id.length - 1) || 0);
        const jitterSign = hash % 2 === 0 ? 1 : -1;
        const jitterMagnitude = (hash % 10) / 100; // up to 9%
        const jitterFactor = 1 + jitterSign * jitterMagnitude;

        const base = processingTimeMs * jitterFactor;
        return base + queueingLatency;
    }

    getUtilizationPct(incomingRate: number): number {
        const throughput = this.getEffectiveThroughput();
        if (throughput <= 0) return 0;
        return Math.min(1, incomingRate / throughput);
    }

    getActiveWorkers(incomingRate: number): number {
        const replicas = this.node.sharedConfig.scaling?.instances ?? 1;
        const utilization = this.getUtilizationPct(incomingRate);
        return Math.min(replicas, Math.max(0, Math.ceil(utilization * replicas)));
    }

    recordTask(latencyMs: number): void {
        this.tasksProcessed += 1;
        this.processingLatencyAccum += latencyMs;
        this.processingLatencyCount += 1;
    }

    recordError(): void {
        this.tasksErrored += 1;
    }

    getAverageProcessingLatencyMs(): number {
        if (this.processingLatencyCount === 0) return 0;
        return this.processingLatencyAccum / this.processingLatencyCount;
    }

    isSaturated(incomingRate: number): boolean {
        const throughput = this.getEffectiveThroughput();
        if (throughput <= 0) return false;
        return incomingRate > throughput;
    }
}


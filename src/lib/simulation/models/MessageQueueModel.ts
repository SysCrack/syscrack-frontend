/**
 * MessageQueueModel — async messaging with partition-based throughput.
 * Decouples producers from consumers, smoothing traffic spikes.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const BASE_CAPACITY_PER_PARTITION = 2000; // Messages/sec per partition

export type BackpressureResult = 'ok' | 'drop' | 'block' | 'spill-to-disk';

export class MessageQueueModel extends ComponentModel {
    // Live Runner State
    public totalEnqueued = 0;
    public totalProcessed = 0;
    public droppedMessages = 0;
    private queueDepth = 0;
    private consecutiveLagTicks = 0;

    private get partitions(): number {
        return this.node.sharedConfig.scaling?.instances ?? 4; // reuse instances as partition count
    }

    private get isFifo(): boolean {
        return (this.node.specificConfig as Record<string, string>).type === 'fifo';
    }

    private get deadLetterQueue(): boolean {
        return (this.node.specificConfig as Record<string, boolean>).deadLetterQueue ?? false;
    }

    /** FIFO queues have lower throughput due to ordering guarantees */
    private get capacityMultiplier(): number {
        const guarantee = (this.node.specificConfig as any)?.deliveryGuarantee;
        let mult = this.isFifo ? 0.3 : 1.0;
        if (guarantee === 'exactly-once') {
            mult *= 0.85; // Additional 15% overhead for exactly-once processing
        }
        return mult;
    }

    // --- Static Engine Methods ---

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const capacity = BASE_CAPACITY_PER_PARTITION * this.partitions * this.capacityMultiplier;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const guarantee = (this.node.specificConfig as any)?.deliveryGuarantee;
        let baseLatency = this.isFifo ? 10 : 3; // FIFO has ordering overhead
        if (guarantee === 'exactly-once') {
            baseLatency += 15; // 15ms protocol overhead for exactly once
        }

        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = baseLatency * 5;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else {
            latency = baseLatency * (1 + utilization * 0.5);
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 75),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        return BASE_CAPACITY_PER_PARTITION * this.partitions * this.capacityMultiplier;
    }

    // --- Live Runner Methods (Task 1 & 2 & 4) ---

    public enqueue(particleCount: number): void {
        const guarantee = (this.node.specificConfig as any)?.deliveryGuarantee;
        let actualEnqueued = particleCount;

        // at-most-once delivery intentionally drops ~1% of messages under load/enqueue
        if (guarantee === 'at-most-once') {
            actualEnqueued = this.applyAtMostOnceDrop(particleCount);
        }

        this.totalEnqueued += actualEnqueued;
        this.queueDepth += actualEnqueued;
    }

    applyAtMostOnceDrop(count: number): number {
        const dropRate = 0.01; // 1% constant drop rate
        const dropped = Math.round(count * dropRate);
        this.droppedMessages += dropped;
        return count - dropped; // messages that survive
    }

    public dequeue(consumerThroughput: number, consumerCount: number): number {
        const capacity = consumerThroughput * Math.max(1, consumerCount);
        let processed = Math.min(this.queueDepth, capacity);

        this.queueDepth -= processed;
        this.totalProcessed += processed;

        return processed;
    }

    public getQueueDepth(): number {
        return this.queueDepth;
    }

    public getConsumerLag(): number {
        return this.consecutiveLagTicks;
    }

    public recordLagTick(isLagging: boolean): void {
        if (isLagging) {
            this.consecutiveLagTicks++;
        } else {
            this.consecutiveLagTicks = 0;
        }
    }

    public applyBackpressure(strategy: 'drop' | 'block' | 'spill-to-disk'): BackpressureResult {
        const maxDepth = (this.node.specificConfig as any)?.maxQueueDepth ?? 10000;
        if (this.queueDepth > maxDepth) {
            return strategy;
        }
        return 'ok';
    }
}

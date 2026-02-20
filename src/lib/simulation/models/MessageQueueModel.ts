/**
 * MessageQueueModel — async messaging with partition-based throughput.
 * Decouples producers from consumers, smoothing traffic spikes.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const BASE_CAPACITY_PER_PARTITION = 2000; // Messages/sec per partition

export class MessageQueueModel extends ComponentModel {
    private get partitions(): number {
        return this.node.sharedConfig.scaling?.replicas ?? 4; // reuse replicas as partition count
    }

    private get isFifo(): boolean {
        return (this.node.specificConfig as Record<string, string>).type === 'fifo';
    }

    private get deadLetterQueue(): boolean {
        return (this.node.specificConfig as Record<string, boolean>).deadLetterQueue ?? false;
    }

    /** FIFO queues have lower throughput due to ordering guarantees */
    private get capacityMultiplier(): number {
        return this.isFifo ? 0.3 : 1.0;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const capacity = BASE_CAPACITY_PER_PARTITION * this.partitions * this.capacityMultiplier;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const baseLatency = this.isFifo ? 10 : 3; // FIFO has ordering overhead

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
}

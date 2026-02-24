/**
 * ProxyModel — data-layer proxy routing to backends.
 * Capacity based on instances × per-node capacity from scaling config.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const BASE_CAPACITY = 8000; // QPS per instance

export class ProxyModel extends ComponentModel {
    private get instances(): number {
        return this.node.sharedConfig?.scaling?.instances ?? 1;
    }

    private get nodeCapacity(): number {
        return this.node.sharedConfig?.scaling?.nodeCapacityRps ?? BASE_CAPACITY;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const totalCapacity = this.nodeCapacity * this.instances;
        const utilization = totalCapacity > 0 ? loadQps / totalCapacity : 1;

        const baseLatency = 1;
        const latency =
            baseLatency + (utilization > 0.8 ? (utilization - 0.8) * 50 : 0);
        const errorRate =
            utilization > 1 ? Math.min(0.5, (utilization - 1) * 0.3) : 0;

        return {
            cpuUsagePercent: Math.min(100, utilization * 100),
            memoryUsageGb: 0.5 * this.instances,
            latencyMs: latency,
            errorRate,
            isHealthy: utilization < 0.95,
            currentConnections: concurrentConnections,
            throughputQps: Math.min(loadQps, totalCapacity),
        };
    }

    maxCapacityQps(): number {
        return this.nodeCapacity * this.instances;
    }
}

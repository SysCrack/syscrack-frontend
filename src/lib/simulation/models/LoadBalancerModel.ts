/**
 * LoadBalancerModel — distributes traffic to downstream.
 * Capacity based on replicas × per-node capacity from scaling config.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const BASE_CAPACITY = 5000; // QPS per instance

export class LoadBalancerModel extends ComponentModel {
    private get replicas(): number {
        return this.node.sharedConfig.scaling?.replicas ?? 2;
    }

    private get nodeCapacity(): number {
        return this.node.sharedConfig.scaling?.nodeCapacityRps ?? BASE_CAPACITY;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const capacity = this.nodeCapacity * this.replicas;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const baseLatency = 1; // ms (very fast L7 proxy)
        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = baseLatency * 5;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else {
            // Slight latency increase under load
            latency = baseLatency * (1 + utilization * 0.5);
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 85),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        return this.nodeCapacity * this.replicas;
    }
}

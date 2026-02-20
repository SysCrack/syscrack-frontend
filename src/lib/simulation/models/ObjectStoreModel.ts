/**
 * ObjectStoreModel — blob storage (S3-like) with storage-class latency tiers.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const STORAGE_CLASS_FACTORS: Record<string, { latencyMs: number; capacityQps: number }> = {
    standard: { latencyMs: 20, capacityQps: 50000 },
    'infrequent-access': { latencyMs: 50, capacityQps: 20000 },
    glacier: { latencyMs: 5000, capacityQps: 1000 },
};

export class ObjectStoreModel extends ComponentModel {
    private get storageClass(): string {
        return (this.node.specificConfig as Record<string, string>).storageClass ?? 'standard';
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const tier = STORAGE_CLASS_FACTORS[this.storageClass] ?? STORAGE_CLASS_FACTORS.standard;
        const utilization = loadQps / tier.capacityQps;

        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = tier.latencyMs * 3;
            errorRate = Math.min(1, (utilization - 1) * 0.5); // Object stores throttle gracefully
            isHealthy = false;
        } else {
            latency = tier.latencyMs * (1 + utilization * 0.2);
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 50), // Managed service, low CPU visibility
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        return (STORAGE_CLASS_FACTORS[this.storageClass] ?? STORAGE_CLASS_FACTORS.standard).capacityQps;
    }
}

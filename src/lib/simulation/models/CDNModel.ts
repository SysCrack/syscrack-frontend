/**
 * CDNModel — edge cache that reduces traffic to origin.
 * Hit rate depends on TTL and edge locations.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const BASE_CAPACITY_PER_EDGE = 10000; // QPS per edge location

export class CDNModel extends ComponentModel {
    private get edgeLocations(): number {
        return (this.node.specificConfig as Record<string, number>).edgeLocations ?? 10;
    }

    private get cacheTtl(): number {
        return (this.node.specificConfig as Record<string, number>).cacheTtl ?? 3600;
    }

    /** Hit rate: more edges + longer TTL = higher hit rate */
    get hitRate(): number {
        const edgeFactor = Math.min(1, this.edgeLocations / 50);
        const ttlFactor = Math.min(1, this.cacheTtl / 7200);
        return 0.6 + 0.35 * (edgeFactor * 0.5 + ttlFactor * 0.5); // 0.60 – 0.95
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const capacity = BASE_CAPACITY_PER_EDGE * this.edgeLocations;
        const utilization = loadQps / capacity;

        const baseLatency = 5; // ms (edge response)
        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = baseLatency * 3;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else {
            latency = baseLatency;
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 70),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        return BASE_CAPACITY_PER_EDGE * this.edgeLocations;
    }
}

/**
 * ClientModel — generates base traffic.
 * Clients are traffic sources, not processors.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

export class ClientModel extends ComponentModel {
    processRequest(loadQps: number, _concurrentConnections: number): SimulationState {
        // Clients just pass through — they generate traffic, not consume it
        return {
            cpuUsagePercent: 0,
            memoryUsageGb: 0,
            latencyMs: 0,
            errorRate: 0,
            isHealthy: true,
            currentConnections: 0,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        return Infinity; // Clients generate, not limit
    }
}

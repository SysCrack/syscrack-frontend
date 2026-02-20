/**
 * AppServerModel — compute instances with instance-type capacity and auto-scaling.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const INSTANCE_CAPACITY: Record<string, number> = {
    small: 500,
    medium: 1500,
    large: 4000,
    xlarge: 8000,
};

export class AppServerModel extends ComponentModel {
    private get instanceType(): string {
        return (this.node.specificConfig as Record<string, string>).instanceType ?? 'medium';
    }

    private get replicas(): number {
        return this.node.sharedConfig.scaling?.replicas ?? 2;
    }

    private get autoScaling(): boolean {
        return (this.node.specificConfig as Record<string, boolean>).autoScaling ?? false;
    }

    private get maxInstances(): number {
        return (this.node.specificConfig as Record<string, number>).maxInstances ?? 10;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const perInstance = INSTANCE_CAPACITY[this.instanceType] ?? 1500;
        let activeReplicas = this.replicas;

        // Auto-scaling: add instances if utilization > 70%
        if (this.autoScaling) {
            const baseCapacity = perInstance * this.replicas;
            const baseUtilization = loadQps / baseCapacity;
            if (baseUtilization > 0.7) {
                const needed = Math.ceil(loadQps / (perInstance * 0.7));
                activeReplicas = Math.min(needed, this.maxInstances);
            }
        }

        const capacity = perInstance * activeReplicas;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const baseLatency = 15; // ms (application logic)
        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = baseLatency * 8;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else if (utilization > 0.8) {
            // Queueing theory: latency increases as utilization approaches 1
            latency = baseLatency / Math.sqrt(1 - utilization);
            errorRate = 0;
            isHealthy = true;
        } else {
            latency = baseLatency * (1 + utilization * 0.2);
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 90),
            memoryUsageGb: activeReplicas * 0.5,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        const perInstance = INSTANCE_CAPACITY[this.instanceType] ?? 1500;
        const maxReplicas = this.autoScaling ? this.maxInstances : this.replicas;
        return perInstance * maxReplicas;
    }
}

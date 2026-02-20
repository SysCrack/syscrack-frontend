/**
 * DatabaseSQLModel — relational database with engine factors and queueing theory latency.
 * Ported from Python simulation/components/database.py.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const INSTANCE_CAPACITY: Record<string, number> = {
    small: 500,
    medium: 2000,
    large: 5000,
    xlarge: 10000,
};

const ENGINE_FACTORS: Record<string, [number, number, number]> = {
    //                   readFactor, writeFactor, baseLatencyMs
    postgresql: [1.0, 0.8, 5.0],
    mysql: [1.2, 0.9, 4.0],
    aurora: [1.5, 1.2, 3.0],
};

export class DatabaseSQLModel extends ComponentModel {
    private get engine(): string {
        return (this.node.specificConfig as Record<string, string>).engine ?? 'postgresql';
    }

    private get instanceType(): string {
        return (this.node.specificConfig as Record<string, string>).instanceType ?? 'medium';
    }

    private get readReplicas(): number {
        return (this.node.specificConfig as Record<string, number>).readReplicas ?? 0;
    }

    private get connectionPooling(): boolean {
        return (this.node.specificConfig as Record<string, boolean>).connectionPooling ?? true;
    }

    private get replicationFactor(): number {
        return this.node.sharedConfig.consistency?.replicationFactor ?? 1;
    }

    private getCapacity(): { read: number; write: number } {
        const baseQps = INSTANCE_CAPACITY[this.instanceType] ?? 2000;
        const [readFactor, writeFactor] = ENGINE_FACTORS[this.engine] ?? [1, 1, 5];

        const readQps = baseQps * readFactor * (1 + this.readReplicas);
        const writeQps = baseQps * writeFactor;

        return { read: readQps, write: writeQps };
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const { read, write } = this.getCapacity();
        // Assume 80% reads, 20% writes
        const capacity = read * 0.8 + write * 0.2;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const baseLatency = (ENGINE_FACTORS[this.engine] ?? [1, 1, 5])[2];

        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization >= 1.0) {
            latency = baseLatency * 10;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else {
            // Queueing theory: sqrt curve for softer degradation
            latency = baseLatency / Math.sqrt(1 - utilization);
            errorRate = 0;
            isHealthy = true;
        }

        // Connection pool penalty
        const maxConns = this.connectionPooling ? 500 * (1 + this.readReplicas) : 100;
        if (concurrentConnections > maxConns) {
            errorRate += 0.1;
            latency += 50;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 80),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate: Math.min(1, errorRate),
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        const { read, write } = this.getCapacity();
        return (read + write) / 2;
    }
}

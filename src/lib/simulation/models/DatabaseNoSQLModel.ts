/**
 * DatabaseNoSQLModel — non-relational DB with consistency-level vs latency trade-off.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const ENGINE_FACTORS: Record<string, [number, number, number]> = {
    //                 readFactor, writeFactor, baseLatencyMs
    dynamodb: [2.0, 2.5, 2.0],
    mongodb: [1.5, 2.0, 2.0],
    cassandra: [1.5, 3.0, 3.0],
};

const BASE_QPS = 5000; // per node

export class DatabaseNoSQLModel extends ComponentModel {
    private get engine(): string {
        return (this.node.specificConfig as Record<string, string>).engine ?? 'dynamodb';
    }

    private get consistencyLevel(): string {
        return (this.node.specificConfig as Record<string, string>).consistencyLevel ?? 'eventual';
    }

    private get instances(): number {
        return this.node.sharedConfig.scaling?.instances ?? 1;
    }

    private get replicationFactor(): number {
        return this.node.sharedConfig.consistency?.replicationFactor ?? 3;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const [readFactor, writeFactor, baseLatency] = ENGINE_FACTORS[this.engine] ?? [1.5, 2.0, 3.0];

        const readCapacity = BASE_QPS * readFactor * Math.max(1, this.instances);
        const writeCapacity = BASE_QPS * writeFactor * Math.max(1, this.instances);
        const capacity = readCapacity * 0.7 + writeCapacity * 0.3;

        const utilization = capacity > 0 ? loadQps / capacity : 2;

        // Strong consistency adds latency (quorum reads)
        const consistencyPenalty = this.consistencyLevel === 'strong' ? 1.5 : 1.0;

        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization >= 1.0) {
            latency = baseLatency * consistencyPenalty * 8;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else {
            latency = baseLatency * consistencyPenalty / Math.sqrt(1 - utilization);
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 85),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate: Math.min(1, errorRate),
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        const [readFactor, writeFactor] = ENGINE_FACTORS[this.engine] ?? [1.5, 2.0];
        return BASE_QPS * ((readFactor + writeFactor) / 2) * Math.max(1, this.instances);
    }
}

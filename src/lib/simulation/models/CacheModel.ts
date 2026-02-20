/**
 * CacheModel — in-memory cache with hit rate reducing downstream traffic.
 * Ported from Python simulation/components/cache.py.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const INSTANCE_CAPACITY_REDIS = 50000; // QPS per node

export class CacheModel extends ComponentModel {
    private get clusterMode(): boolean {
        return (this.node.specificConfig as Record<string, boolean>).clusterMode ?? false;
    }

    private get instances(): number {
        return this.node.sharedConfig.scaling?.instances ?? 1;
    }

    /** Hit rate based on read strategy, write strategy, TTL, and eviction policy. */
    get hitRate(): number {
        const c = this.node.specificConfig as Record<string, string | number>;
        const readStrategy = (c.readStrategy as string) ?? 'cache-aside';
        const writeStrategy = (c.writeStrategy as string) ?? 'write-around';
        const evictionPolicy = (c.evictionPolicy as string) ?? 'lru';
        const defaultTtl = (c.defaultTtl as number) ?? 3600;

        // Read-through has better hit rate than cache-aside (proactive population)
        const strategyBonus = readStrategy === 'read-through' ? 0.05 : 0;
        // Longer TTL = higher hit rate (less expiration churn)
        const ttlFactor = Math.min(1, defaultTtl / 7200);
        // Write strategy: write-through keeps cache consistent (+hit), write-behind can lag slightly
        const writeMod = writeStrategy === 'write-through' ? 0.02 : writeStrategy === 'write-behind' ? -0.01 : 0;
        // Eviction: LFU favors hot keys (+hit), FIFO/random less predictable
        const evictionMod = evictionPolicy === 'lfu' ? 0.02 : evictionPolicy === 'fifo' || evictionPolicy === 'random' ? -0.02 : 0;

        return Math.min(0.98, Math.max(0.1, 0.75 + strategyBonus + ttlFactor * 0.15 + writeMod + evictionMod));
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const nodes = this.clusterMode ? Math.max(3, this.instances) : Math.max(1, this.instances);
        const capacity = INSTANCE_CAPACITY_REDIS * nodes;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const baseLatency = 0.5; // ms (Redis is fast)
        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = baseLatency * 5;
            errorRate = Math.min(1, utilization - 1);
            isHealthy = false;
        } else {
            latency = baseLatency * (1 + utilization * 0.3);
            errorRate = 0;
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 90),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    maxCapacityQps(): number {
        const nodes = this.clusterMode ? Math.max(3, this.instances) : Math.max(1, this.instances);
        return INSTANCE_CAPACITY_REDIS * nodes;
    }
}

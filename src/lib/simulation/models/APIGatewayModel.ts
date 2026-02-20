/**
 * APIGatewayModel — auth + rate limiting + request transformation overhead.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const BASE_CAPACITY = 8000; // QPS per instance

export class APIGatewayModel extends ComponentModel {
    private get instances(): number {
        return this.node.sharedConfig.scaling?.instances ?? 1;
    }

    private get authEnabled(): boolean {
        return (this.node.specificConfig as Record<string, boolean>).authEnabled ?? true;
    }

    private get rateLimiting(): boolean {
        return this.node.sharedConfig.trafficControl?.rateLimiting ?? false;
    }

    private get rateLimit(): number {
        return this.node.sharedConfig.trafficControl?.rateLimit ?? 10000;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const capacity = BASE_CAPACITY * this.instances;

        // Rate limiting: reject excess
        let effectiveLoad = loadQps;
        let rateLimitedRate = 0;
        if (this.rateLimiting && loadQps > this.rateLimit) {
            rateLimitedRate = (loadQps - this.rateLimit) / loadQps;
            effectiveLoad = this.rateLimit;
        }

        const utilization = capacity > 0 ? effectiveLoad / capacity : 2;
        const authOverhead = this.authEnabled ? 2 : 0; // ms
        const baseLatency = 3 + authOverhead;

        let latency: number;
        let errorRate: number;
        let isHealthy: boolean;

        if (utilization > 1.0) {
            latency = baseLatency * 4;
            errorRate = Math.min(1, utilization - 1 + rateLimitedRate);
            isHealthy = false;
        } else {
            latency = baseLatency * (1 + utilization * 0.3);
            errorRate = rateLimitedRate; // 429s from rate limiting
            isHealthy = true;
        }

        return {
            cpuUsagePercent: Math.min(100, utilization * 80),
            memoryUsageGb: 0,
            latencyMs: latency,
            errorRate,
            isHealthy,
            currentConnections: concurrentConnections,
            throughputQps: effectiveLoad,
        };
    }

    maxCapacityQps(): number {
        const base = BASE_CAPACITY * this.instances;
        return this.rateLimiting ? Math.min(base, this.rateLimit) : base;
    }
}

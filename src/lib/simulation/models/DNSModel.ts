import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

export class DNSModel extends ComponentModel {
    private failoverStartTicks = new Map<string, number>();
    private removedBackends = new Set<string>();
    private consecutiveHighErrors = new Map<string, number>();

    maxCapacityQps(): number {
        return Infinity; // DNS capacity is virtually unlimited in this simulation
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        return {
            cpuUsagePercent: 0,
            memoryUsageGb: 0,
            latencyMs: 1,
            errorRate: 0,
            isHealthy: true,
            currentConnections: concurrentConnections,
            throughputQps: loadQps,
        };
    }

    recordHealthCheck(
        backendId: string,
        errorRate: number,
        tick: number,
        healthCheckConfig: any,
        tickDurationMs: number,
        chaosNodeFailure?: boolean
    ) {
        if (!healthCheckConfig || healthCheckConfig.enabled === false) return;

        const intervalSeconds = healthCheckConfig.intervalSeconds ?? 30;
        const failoverDelayMs = healthCheckConfig.failoverDelayMs ?? 60000;

        const intervalTicks = Math.max(1, Math.round((intervalSeconds * 1000) / tickDurationMs));
        const failoverDelayTicks = Math.max(2, Math.round(failoverDelayMs / tickDurationMs));

        const isFailing = errorRate > 0.5 || chaosNodeFailure;

        if (isFailing) {
            const current = this.consecutiveHighErrors.get(backendId) ?? 0;
            this.consecutiveHighErrors.set(backendId, current + 1);

            if (current + 1 >= intervalTicks && !this.failoverStartTicks.has(backendId) && !this.removedBackends.has(backendId)) {
                this.failoverStartTicks.set(backendId, tick);
            }
        } else {
            if (!this.failoverStartTicks.has(backendId)) {
                this.consecutiveHighErrors.set(backendId, 0);
            }
        }

        if (this.failoverStartTicks.has(backendId)) {
            const startTick = this.failoverStartTicks.get(backendId)!;
            if (tick >= startTick + failoverDelayTicks) {
                this.removedBackends.add(backendId);
                this.failoverStartTicks.delete(backendId);
            }
        }
    }

    isInFailoverWindow(backendId: string): boolean {
        return this.failoverStartTicks.has(backendId);
    }

    isRemoved(backendId: string): boolean {
        return this.removedBackends.has(backendId);
    }
}

/**
 * LoadBalancerModel — distributes traffic to downstream.
 * Capacity based on instances × per-node capacity from scaling config.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';
import type { CanvasConnection } from '../../types/canvas';

const BASE_CAPACITY = 5000; // QPS per instance

export class LoadBalancerModel extends ComponentModel {
    private get instances(): number {
        return this.node.sharedConfig.scaling?.instances ?? 1;
    }

    private get nodeCapacity(): number {
        return this.node.sharedConfig.scaling?.nodeCapacityRps ?? BASE_CAPACITY;
    }

    get maxCapacityQps(): number {
        return this.nodeCapacity * this.instances;
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const capacity = this.maxCapacityQps;
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

    // --- Failover & Routing State ---
    private consecutiveHighErrors = new Map<string, number>();
    private failoverStartTicks = new Map<string, number>();
    private removedBackends = new Set<string>();
    private rrCounters = new Map<string, number>();
    private stickyBuckets = new Map<string, Map<number, string>>();

    reset() {
        this.consecutiveHighErrors.clear();
        this.failoverStartTicks.clear();
        this.removedBackends.clear();
        this.rrCounters.clear();
        this.stickyBuckets.clear();
    }

    recordHealthCheck(
        backendId: string,
        errorRate: number,
        tick: number,
        healthCheckConfig: any,
        tickDurationMs: number,
        chaosNodeFailure?: boolean
    ) {
        if (!healthCheckConfig || healthCheckConfig.enabled === false) {
            return;
        }

        const intervalSeconds = healthCheckConfig.intervalSeconds ?? 5;
        const failoverDelayMs = healthCheckConfig.failoverDelayMs ?? 0;

        const intervalTicks = Math.max(1, Math.round((intervalSeconds * 1000) / tickDurationMs));
        const failoverDelayTicks = Math.max(2, Math.round(failoverDelayMs / tickDurationMs));

        const isFailing = errorRate > 0.5 || chaosNodeFailure;

        if (isFailing) {
            const current = this.consecutiveHighErrors.get(backendId) ?? 0;
            this.consecutiveHighErrors.set(backendId, current + 1);

            if (
                current + 1 >= intervalTicks &&
                !this.failoverStartTicks.has(backendId) &&
                !this.removedBackends.has(backendId)
            ) {
                this.failoverStartTicks.set(backendId, tick);
            }
        } else {
            // Only clear errors if we actually had successful traffic (errorRate <= 0.5).
            // But if we are IN the failover window, traffic is likely 0, so we shouldn't clear.
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

    getHealthyConnections(outConns: CanvasConnection[]): CanvasConnection[] {
        return outConns.filter(c => !this.removedBackends.has(c.targetId));
    }

    selectBackend(
        lbId: string,
        algorithm: string,
        outConns: CanvasConnection[],
        nodeActiveCount: Map<string, number>,
        weights?: Record<string, number>,
        particleHash?: number
    ): CanvasConnection | null {
        if (outConns.length === 0) return null;
        if (algorithm === 'weighted' && weights) {
            const totalWeight = outConns.reduce((s, c) => s + (weights[c.targetId] ?? 1), 0);
            if (totalWeight > 0) {
                let r = Math.random() * totalWeight;
                for (const conn of outConns) {
                    const w = weights[conn.targetId] ?? 1;
                    if (r < w) {
                        return conn;
                    }
                    r -= w;
                }
                return outConns[outConns.length - 1];
            }
            // If totalWeight === 0, fall through to round-robin
        }

        if (algorithm === 'ip-hash') {
            const hash = particleHash ?? Math.floor(Math.random() * 10);

            let buckets = this.stickyBuckets.get(lbId);
            if (!buckets) {
                buckets = new Map<number, string>();
                this.stickyBuckets.set(lbId, buckets);
            }

            const pinnedBackendId = buckets.get(hash);

            if (pinnedBackendId) {
                const conn = outConns.find(c => c.targetId === pinnedBackendId);
                if (conn) {
                    return conn;
                }
            }

            const newTargetIndex = hash % outConns.length;
            const targetConn = outConns[newTargetIndex];
            buckets.set(hash, targetConn.targetId);
            return targetConn;
        }

        if (algorithm === 'least-connections') {
            let minCount = Infinity;
            let chosenConn = outConns[0];
            for (const conn of outConns) {
                const active = nodeActiveCount.get(conn.targetId) ?? 0;
                if (active < minCount) {
                    minCount = active;
                    chosenConn = conn;
                }
            }
            return chosenConn;
        }

        if (algorithm === 'random') {
            return outConns[Math.floor(Math.random() * outConns.length)];
        }

        const currentIdx = this.rrCounters.get(lbId) ?? 0;
        const nextIdx = currentIdx % outConns.length;
        this.rrCounters.set(lbId, currentIdx + 1);
        return outConns[nextIdx];
    }
}

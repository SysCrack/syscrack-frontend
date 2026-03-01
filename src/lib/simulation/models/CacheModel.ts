/**
 * CacheModel — in-memory cache with hit rate reducing downstream traffic.
 * Enhanced with stampede tracking, prevention strategies, and write-behind stale read counting.
 * Ported from Python simulation/components/cache.py.
 */
import { ComponentModel } from '../ComponentModel';
import type { SimulationState } from '../types';

const INSTANCE_CAPACITY_REDIS = 50000; // QPS per node

export interface StampedeResult {
    forwardToDb: number;
    queued: number;
}

export class CacheModel extends ComponentModel {
    // --- Existing ---
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

        const strategyBonus = readStrategy === 'read-through' ? 0.05 : 0;
        const ttlFactor = Math.min(1, defaultTtl / 7200);
        const writeMod = writeStrategy === 'write-through' ? 0.02 : writeStrategy === 'write-behind' ? -0.01 : 0;
        const evictionMod = evictionPolicy === 'lfu' ? 0.02 : evictionPolicy === 'fifo' || evictionPolicy === 'random' ? -0.02 : 0;

        return Math.min(0.98, Math.max(0.1, 0.75 + strategyBonus + ttlFactor * 0.15 + writeMod + evictionMod));
    }

    processRequest(loadQps: number, concurrentConnections: number): SimulationState {
        const nodes = this.clusterMode ? Math.max(3, this.instances) : Math.max(1, this.instances);
        const capacity = INSTANCE_CAPACITY_REDIS * nodes;
        const utilization = capacity > 0 ? loadQps / capacity : 2;

        const baseLatency = 0.5;
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

    // --- Stampede Tracking ---
    private stampedeActive = false;
    private flushTick = -1;
    private flushed = false;
    private concurrentMissesThisTick = 0;
    private lastMissTick = -1;
    private readonly stampedeThreshold = 10;
    private static readonly RECOVERY_TICKS = 50; // 5 seconds at 100ms/tick

    /** Called when chaos.cacheFlush fires. */
    flush(tick: number): void {
        this.flushTick = tick;
        this.flushed = true;
    }

    /** True while in the post-flush stampede window, IF prevention is 'none'. */
    isFlushed(tick: number, stampedePrevention: string): boolean {
        if (!this.flushed || stampedePrevention !== 'none') return false;
        if (tick - this.flushTick >= CacheModel.RECOVERY_TICKS) {
            this.flushed = false;
            this.stampedeActive = false;
            return false;
        }
        return true;
    }

    /** Track concurrent misses in a single tick for stampede detection. */
    recordMisses(count: number, tick: number): void {
        if (tick !== this.lastMissTick) {
            this.concurrentMissesThisTick = 0;
            this.lastMissTick = tick;
        }
        this.concurrentMissesThisTick += count;
        if (this.concurrentMissesThisTick > this.stampedeThreshold) this.stampedeActive = true;
    }

    /** Ratio of concurrent misses to stampede threshold. */
    getStampedeRisk(): number {
        return this.concurrentMissesThisTick / this.stampedeThreshold;
    }

    getConcurrentMisses(): number {
        return this.concurrentMissesThisTick;
    }

    /** Returns stampede diagnostic string when concurrent misses exceed threshold, else null. */
    getStampedeDiagnostic(): string | null {
        if (this.stampedeActive) {
            return `Cache stampede: ${this.concurrentMissesThisTick} simultaneous misses → DB`;
        }
        return null;
    }

    /**
     * Apply stampede prevention strategy. Returns how many misses to forward to DB
     * and how many to queue locally.
     *
     * CRITICAL: 'none' returns { forwardToDb: missCount, queued: 0 } — raw passthrough.
     */
    applyStampedePrevention(strategy: string, missCount: number, _tick: number): StampedeResult {
        switch (strategy) {
            case 'mutex-lock':
            case 'promise-coalescing':
                // Only 1 request fetches from DB; rest queue in cache
                return { forwardToDb: Math.min(1, missCount), queued: Math.max(0, missCount - 1) };

            case 'probabilistic-early-expiry':
                // 10% of misses trigger background recompute
                return { forwardToDb: Math.max(1, Math.ceil(missCount * 0.1)), queued: 0 };

            case 'none':
            default:
                // All concurrent misses hit DB simultaneously
                return { forwardToDb: missCount, queued: 0 };
        }
    }

    // --- Write-Behind Stale Read Tracking (TC-008) ---

    private _staleReadCount = 0;
    private _writeBehindPendingKeys = new Set<string>();
    private _writeBehindPendingTick = new Map<string, number>();
    private _totalWriteBehindWrites = 0;

    /** Record a write-behind write: key is pending until DB persistence completes. */
    recordWriteBehindWrite(key: string, tick: number, delayTicks: number = 5): void {
        this._writeBehindPendingKeys.add(key);
        this._writeBehindPendingTick.set(key, tick + delayTicks);
        this._totalWriteBehindWrites++;
    }

    /** Check if a read hits a key still pending write-behind persistence. */
    checkStaleRead(key: string, tick: number): boolean {
        const expiresAt = this._writeBehindPendingTick.get(key);
        if (expiresAt !== undefined) {
            if (tick >= expiresAt) {
                this._writeBehindPendingKeys.delete(key);
                this._writeBehindPendingTick.delete(key);
                return false;
            }
            return true; // Key still pending → stale read
        }
        return false;
    }

    recordStaleRead(count: number = 1): void {
        this._staleReadCount += count;
    }

    getStaleReadCount(): number {
        return this._staleReadCount;
    }

    getPendingWriteCount(): number {
        return this._writeBehindPendingKeys.size;
    }

    getTotalWriteBehindWrites(): number {
        return this._totalWriteBehindWrites;
    }

    /** Clean up expired pending keys. */
    tickCleanup(tick: number): void {
        for (const [key, expiresAt] of this._writeBehindPendingTick) {
            if (tick >= expiresAt) {
                this._writeBehindPendingKeys.delete(key);
                this._writeBehindPendingTick.delete(key);
            }
        }
    }

    // --- Write-Around: next N reads for key are forced misses ---

    private writeAroundMissCountdown = new Map<string, number>();

    recordWriteAroundKey(key: string, missCount: number): void {
        this.writeAroundMissCountdown.set(
            key,
            (this.writeAroundMissCountdown.get(key) ?? 0) + missCount,
        );
    }

    /** Returns true if this read should be forced to miss (and consumes one countdown). */
    consumeWriteAroundMiss(key: string): boolean {
        const remaining = this.writeAroundMissCountdown.get(key) ?? 0;
        if (remaining > 0) {
            this.writeAroundMissCountdown.set(key, remaining - 1);
            return true; // force miss
        }
        return false;
    }
}

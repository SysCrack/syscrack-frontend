import { ComponentModel } from '../ComponentModel';
import type { CanvasNode } from '@/lib/types/canvas';

export interface RouteReadResult {
    staleRead: boolean;
}

export interface RouteWriteResult {
    replicationLatencyMs: number;
}

export class DBReplicationModel extends ComponentModel {
    private lastWriteTick = -1;
    private failoverStartTick = -1;
    private failoverActive = false;
    private _staleReadCount = 0;

    processRequest(loadQps: number, concurrentConnections: number): any {
        // Not used for DatabaseModel explicitly yet
        return null as any;
    }

    maxCapacityQps(): number {
        return (this.node.sharedConfig.scaling?.nodeCapacityRps ?? 1000) as number;
    }

    private get replicationConfig() {
        const c = this.node.specificConfig as Record<string, unknown>;
        const r = (c.replication ?? {}) as Record<string, unknown>;
        return {
            mode: (r.mode as string) ?? 'single-leader',
            syncMode: (r.syncMode as string) ?? 'asynchronous',
            replicationLagMs: (r.replicationLagMs as number) ?? 100,
            lagVarianceMs: (r.lagVarianceMs as number) ?? 20,
            catchUpOnFailover: (r.catchUpOnFailover as boolean) ?? false,
        };
    }

    private getLagTicks(tickDurationMs: number): number {
        return Math.ceil(this.replicationConfig.replicationLagMs / tickDurationMs);
    }

    /**
     * Call this when a write particle arrives at this DB node.
     * Returns extra latency to add based on sync mode.
     */
    routeWrite(tick: number, tickDurationMs: number): RouteWriteResult {
        const cfg = this.replicationConfig;
        this.lastWriteTick = tick;

        // TC-042: if failover is active (within catch-up window), writes should error.
        // The runner handles errors via chaos.nodeFailure; we only add replication latency here.
        let replicationLatencyMs = 0;
        if (cfg.syncMode === 'synchronous') {
            const readReplicas = (this.node.specificConfig as Record<string, unknown>).readReplicas as number ?? 1;
            replicationLatencyMs = cfg.replicationLagMs * Math.max(1, readReplicas);
        } else if (cfg.syncMode === 'semi-synchronous') {
            replicationLatencyMs = cfg.replicationLagMs;
        }
        // asynchronous: no extra write latency
        return { replicationLatencyMs };
    }

    /**
     * Call this when a read particle arrives at this DB node.
     * Returns whether the read hits a lagging replica (stale).
     */
    routeRead(tick: number, tickDurationMs: number): RouteReadResult {
        const cfg = this.replicationConfig;

        if (cfg.mode === 'leaderless') {
            const specific = this.node.specificConfig as Record<string, unknown>;
            const quorum = (specific.quorum ?? {}) as Record<string, unknown>;
            const n = (quorum.n as number) ?? 3;
            const w = (quorum.w as number) ?? 2;
            const r = (quorum.r as number) ?? 2;

            if (w + r <= n) {
                const gapRatio = n > 0 ? (n - (w + r)) / n : 0;
                const staleRead = Math.random() < (0.3 + gapRatio * 0.5);
                if (staleRead) this._staleReadCount++;
                return { staleRead };
            }
            return { staleRead: false };
        }

        if (cfg.syncMode !== 'asynchronous') return { staleRead: false };
        if (this.lastWriteTick < 0) return { staleRead: false };

        const lagTicks = this.getLagTicks(tickDurationMs);
        const staleRead = tick < this.lastWriteTick + lagTicks;
        if (staleRead) this._staleReadCount++;
        return { staleRead };
    }

    /**
     * TC-042 — Single leader failover.
     * Call this in computeLiveMetrics when chaos.nodeFailure is true on this node.
     * Returns true if currently in catch-up window (writes should error).
     */
    startFailover(tick: number): void {
        if (!this.failoverActive) {
            this.failoverStartTick = tick;
            this.failoverActive = true;
        }
    }

    isInFailoverWindow(tick: number, tickDurationMs: number): boolean {
        if (!this.failoverActive) return false;
        const cfg = this.replicationConfig;
        if (!cfg.catchUpOnFailover) return false;
        const catchUpTicks = this.getLagTicks(tickDurationMs);
        if (tick >= this.failoverStartTick + catchUpTicks) {
            this.failoverActive = false; // catch-up complete
            return false;
        }
        return true;
    }

    resetFailover(): void {
        this.failoverActive = false;
        this.failoverStartTick = -1;
    }

    getReplicationLagMs(): number {
        const cfg = this.replicationConfig;
        const jitter = (Math.random() - 0.5) * 2 * cfg.lagVarianceMs;
        return Math.max(0, cfg.replicationLagMs + jitter);
    }

    getStaleReadCount(): number {
        return this._staleReadCount;
    }

    get syncMode(): string {
        return this.replicationConfig.syncMode;
    }

    get replicationMode(): string {
        return this.replicationConfig.mode;
    }

    get replicationLagMs(): number {
        return this.replicationConfig.replicationLagMs;
    }

    get isolationLevel(): string {
        const c = this.node.specificConfig as Record<string, unknown>;
        return (c.isolation as string) ?? 'read-committed';
    }

    getIsolationLatencyMultiplier(): number {
        switch (this.isolationLevel) {
            case 'read-uncommitted': return 1.0;
            case 'read-committed': return 1.1;
            case 'repeatable-read': return 1.2;
            case 'serializable': return 1.6;
            default: return 1.1;
        }
    }

    getIsolationCapacityFactor(): number {
        switch (this.isolationLevel) {
            case 'read-uncommitted': return 1.0;
            case 'read-committed': return 0.95;
            case 'repeatable-read': return 0.85;
            case 'serializable': return 0.55;
            default: return 0.95;
        }
    }

    getStorageEngineLatencyMultiplier(readWrite: 'read' | 'write'): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        const se = (c.storageEngine ?? {}) as Record<string, unknown>;
        const engineType = (se.type as string) ?? 'b-tree';
        const bloomFilters = (se.bloomFilters as boolean) ?? false;

        if (engineType === 'lsm-tree') {
            if (readWrite === 'write') return 0.6;
            // Read: bloom filters reduce amplification
            return bloomFilters ? 1.1 : 1.4;
        }
        // b-tree: baseline 1.0x for both
        return 1.0;
    }

    getQuorumLatencyMultiplier(readWrite: 'read' | 'write'): number {
        const specific = this.node.specificConfig as Record<string, unknown>;
        const replication = (specific.replication ?? {}) as Record<string, unknown>;
        if ((replication.mode as string) !== 'leaderless') return 1.0;

        const quorum = (specific.quorum ?? {}) as Record<string, unknown>;
        const n = (quorum.n as number) ?? 3;
        const w = (quorum.w as number) ?? 2;
        const r = (quorum.r as number) ?? 2;

        if (readWrite === 'write') {
            return 1 + (w / n) * 0.5;
        }
        return 1 + (r / n) * 0.5;
    }

    getHotShardLatencyMultiplier(): number {
        const specific = this.node.specificConfig as Record<string, unknown>;
        const sharding = (specific.sharding ?? {}) as Record<string, unknown>;
        const enabled = (sharding.enabled as boolean) ?? false;
        if (!enabled) return 1.0;

        const hotspotFactor = (sharding.hotspotFactor as number) ?? 0;
        const strategy = (sharding.strategy as string) ?? 'hash-based';

        const isHot = hotspotFactor > 0.3 || strategy === 'range-based';
        if (!isHot) return 1.0;

        return 1 + hotspotFactor * 4;
    }

    // ── LSM Compaction Spike ──────────────────────────────

    private compactionActive = false;
    private compactionStartTick = -1;
    private compactionDurationTicks = 0;
    private nextCompactionTick = -1;

    initCompaction(currentTick: number, tickDurationMs: number): void {
        if (this.nextCompactionTick < 0) {
            // First init: schedule first compaction 30-60 sim-seconds from now
            const minTicks = Math.ceil(30000 / tickDurationMs);
            const maxTicks = Math.ceil(60000 / tickDurationMs);
            this.nextCompactionTick = currentTick +
                minTicks + Math.floor(Math.random() * (maxTicks - minTicks));
        }
    }

    tickCompaction(currentTick: number, tickDurationMs: number): void {
        const se = (this.node.specificConfig as Record<string, unknown>).storageEngine as
            Record<string, unknown> | undefined;
        if ((se?.type as string) !== 'lsm-tree') return;

        this.initCompaction(currentTick, tickDurationMs);

        if (!this.compactionActive && currentTick >= this.nextCompactionTick) {
            // Start compaction spike
            this.compactionActive = true;
            this.compactionStartTick = currentTick;
            // Spike lasts ~5 sim-seconds
            this.compactionDurationTicks = Math.ceil(5000 / tickDurationMs);
        }

        if (this.compactionActive) {
            const elapsed = currentTick - this.compactionStartTick;
            if (elapsed >= this.compactionDurationTicks) {
                this.compactionActive = false;
                // Schedule next compaction 30-60 sim-seconds out
                const minTicks = Math.ceil(30000 / tickDurationMs);
                const maxTicks = Math.ceil(60000 / tickDurationMs);
                this.nextCompactionTick = currentTick +
                    minTicks + Math.floor(Math.random() * (maxTicks - minTicks));
            }
        }
    }

    isCompacting(): boolean {
        return this.compactionActive;
    }

    getCompactionLatencyMultiplier(): number {
        return this.compactionActive ? 2.0 + Math.random() : 1.0; // 2–3× during spike
    }

    getNextCompactionInSeconds(currentTick: number, tickDurationMs: number): number {
        if (this.compactionActive) return 0;
        const ticksUntil = Math.max(0, this.nextCompactionTick - currentTick);
        return Math.round(ticksUntil * tickDurationMs / 1000);
    }
}

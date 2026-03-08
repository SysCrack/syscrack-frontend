/**
 * CacheInternals — donut, entry count, top 5 hot entries, shared CacheEntriesList.
 * Renders in right panel when node is in internals mode.
 */
'use client';

import type { ComponentDetailData } from '@/lib/simulation/types';
import type { NodeDetailMetrics } from '@/lib/simulation/types';
import CacheEntriesList from '../CacheEntriesList';
import { hitCount } from '../CacheEntriesList';

interface CacheInternalsProps {
    nodeId: string;
    detail: Extract<ComponentDetailData, { kind: 'cache' }> | undefined;
    simState?: NodeDetailMetrics;
    workloadHints?: { cacheKeyPattern?: string; sampleData?: { id: string; preview: string }[] };
}

export default function CacheInternals({ nodeId, detail, simState, workloadHints }: CacheInternalsProps) {
    if (!detail) return <div style={{ color: '#64748b', fontSize: 11 }}>—</div>;
    const hitPct = detail.hitRate * 100;
    const missPct = 100 - hitPct;
    const r = 24;
    const circumference = 2 * Math.PI * r;
    const hitLen = circumference * detail.hitRate;
    const missLen = circumference * (1 - detail.hitRate);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width={48} height={48} viewBox="0 0 48 48">
                    <circle cx={24} cy={24} r={r} fill="none" stroke="#2a3244" strokeWidth={6} />
                    <circle
                        cx={24}
                        cy={24}
                        r={r}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth={6}
                        strokeDasharray={`${hitLen} ${missLen}`}
                        strokeDashoffset={0}
                        transform="rotate(-90 24 24)"
                    />
                    <circle
                        cx={24}
                        cy={24}
                        r={r}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={6}
                        strokeDasharray={`${missLen} ${hitLen}`}
                        strokeDashoffset={-hitLen}
                        transform="rotate(-90 24 24)"
                    />
                </svg>
                <div style={{ fontSize: 11, color: '#e2e8f0' }}>
                    Hit rate: <strong>{hitPct.toFixed(1)}%</strong> · Misses: {missPct.toFixed(1)}%
                </div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {detail.entries.length} / {detail.maxEntries} entries · {detail.evictionPolicy}
            </div>
            {detail.entries.length > 0 && (
                <>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Top 5 hot</div>
                    {[...detail.entries]
                        .sort((a, b) => hitCount(b) - hitCount(a))
                        .slice(0, 5)
                        .map((e) => {
                            const maxH = Math.max(1, ...detail.entries.map(hitCount));
                            const w = (hitCount(e) / maxH) * 120;
                            return (
                                <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace', width: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.key}</span>
                                    <div style={{ width: 120, height: 6, background: '#2a3244', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: w, height: 6, background: '#10b981', borderRadius: 3 }} />
                                    </div>
                                    <span style={{ color: '#64748b' }}>×{hitCount(e)}</span>
                                </div>
                            );
                        })}
                </>
            )}
            <CacheEntriesList
                nodeId={nodeId}
                entries={detail.entries}
                maxEntries={detail.maxEntries}
                hitRate={detail.hitRate}
                evictionPolicy={detail.evictionPolicy}
                workloadHints={workloadHints}
                showFlushAll={true}
            />
        </div>
    );
}

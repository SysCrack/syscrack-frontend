/**
 * CacheEntriesList — shared entries list with evict/flush for CacheDetail and CacheInternals.
 */
'use client';

import { useState, useEffect } from 'react';
import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';
import type { CacheEntry } from '@/lib/simulation/types';

function extractId(key: string, pattern?: string): string {
    if (!pattern) return key;
    const prefix = pattern.split('{')[0];
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

export interface CacheEntriesListProps {
    nodeId: string;
    entries: CacheEntry[];
    maxEntries: number;
    hitRate: number;
    evictionPolicy: string;
    workloadHints?: { cacheKeyPattern?: string; sampleData?: { id: string; preview: string }[] };
    showFlushAll?: boolean;
}

export function hitCount(e: CacheEntry): number {
    return e.hitCount ?? e.accessCount ?? 0;
}

export function isEvictionCandidate(e: CacheEntry): boolean {
    return e.isEvictionCandidate ?? e.willEvict ?? false;
}

export default function CacheEntriesList({
    nodeId,
    entries,
    maxEntries,
    hitRate,
    evictionPolicy,
    workloadHints,
    showFlushAll = true,
}: CacheEntriesListProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [flushConfirming, setFlushConfirming] = useState(false);
    const selectedEntry = selectedKey ? entries.find((e) => e.key === selectedKey) : null;
    const entryId = selectedKey ? extractId(selectedKey, workloadHints?.cacheKeyPattern) : '';
    const samplePreview = workloadHints?.sampleData?.find((s) => s.id === entryId)?.preview;

    useEffect(() => {
        if (selectedKey && !entries.some((e) => e.key === selectedKey)) setSelectedKey(null);
    }, [entries, selectedKey]);

    const handleEvict = (key: string) => {
        useCanvasSimulationStore.getState().evictCacheEntry(nodeId, key);
    };

    const handleFlushAll = () => {
        useCanvasSimulationStore.getState().flushCache(nodeId);
        setFlushConfirming(false);
        setSelectedKey(null);
    };

    return (
        <>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                {entries.length} / {maxEntries} (next evict marked)
            </div>
            {entries.slice(0, 24).map((entry) => (
                <div
                    key={entry.key}
                    onClick={() => setSelectedKey(entry.key)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: selectedKey === entry.key ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                        border: selectedKey === entry.key ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                    }}
                >
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: isEvictionCandidate(entry) ? '#fbbf24' : '#22c55e',
                            flexShrink: 0,
                        }}
                    />
                    <span
                        style={{
                            flex: 1,
                            fontSize: 11,
                            color: '#e2e8f0',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {entry.key}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>×{hitCount(entry)}</span>
                    {selectedKey === entry.key && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEvict(entry.key);
                            }}
                            style={{
                                padding: '2px 8px',
                                fontSize: 10,
                                borderRadius: 4,
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                cursor: 'pointer',
                                flexShrink: 0,
                            }}
                        >
                            Evict
                        </button>
                    )}
                </div>
            ))}
            {entries.length > 24 && (
                <div style={{ fontSize: 10, color: '#64748b' }}>+{entries.length - 24} more</div>
            )}

            {selectedKey && selectedEntry && (
                <div
                    style={{
                        margin: '8px 0',
                        padding: '8px 10px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#60a5fa', marginBottom: 4 }}>
                        {selectedKey}
                    </div>
                    {samplePreview && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>{samplePreview}</div>
                    )}
                    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b', flexWrap: 'wrap' }}>
                        <span>
                            Hits: <b style={{ color: '#e2e8f0' }}>{hitCount(selectedEntry)}</b>
                        </span>
                        {selectedEntry.ttlRemaining != null && (
                            <span>
                                TTL: <b style={{ color: '#e2e8f0' }}>{Math.round(selectedEntry.ttlRemaining)}s</b>
                            </span>
                        )}
                        {isEvictionCandidate(selectedEntry) && (
                            <span style={{ color: '#fbbf24' }}>⚠ Next eviction target</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => handleEvict(selectedKey)}
                        style={{
                            marginTop: 8,
                            width: '100%',
                            padding: '5px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 6,
                            border: '1px solid rgba(239, 68, 68, 0.5)',
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#ef4444',
                            cursor: 'pointer',
                        }}
                    >
                        Evict this entry
                    </button>
                </div>
            )}

            <div
                style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                }}
            >
                <span style={{ fontSize: 10, color: '#64748b' }}>
                    {entries.length} entries · {Math.round(hitRate * 100)}% hit rate
                </span>
                {showFlushAll && (
                    flushConfirming ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: '#fbbf24' }}>Flush all entries?</span>
                            <button type="button" onClick={handleFlushAll} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 5, border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer' }}>Yes</button>
                            <button type="button" onClick={() => setFlushConfirming(false)} style={{ padding: '4px 10px', fontSize: 10, borderRadius: 5, border: '1px solid #475569', background: '#2a3244', color: '#94a3b8', cursor: 'pointer' }}>No</button>
                        </div>
                    ) : (
                        <button type="button" onClick={() => setFlushConfirming(true)} style={{ padding: '4px 10px', fontSize: 10, borderRadius: 5, border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', cursor: 'pointer' }}>Flush All</button>
                    )
                )}
            </div>
        </>
    );
}

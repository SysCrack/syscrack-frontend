'use client';

import React, { useState } from 'react';
import type { ScenarioTemplate } from '@/lib/templates';

interface RationaleBannerProps {
    template: ScenarioTemplate;
    onDismiss: () => void;
    onClearTemplate: () => void;
}

export default function RationaleBanner({ template, onDismiss, onClearTemplate }: RationaleBannerProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.95)',
                borderBottom: '1px solid #1e293b',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontFamily: 'Inter, system-ui, sans-serif',
                zIndex: 50,
            }}
        >
            {/* Info icon */}
            <span style={{ fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>ℹ️</span>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginRight: 8 }}>
                    {template.name}
                </span>
                <span
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        cursor: 'pointer',
                        lineHeight: '20px',
                        ...(expanded
                            ? {}
                            : {
                                display: 'inline-block',
                                maxWidth: 'calc(100% - 120px)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' as const,
                                verticalAlign: 'bottom',
                            }),
                    }}
                    title={expanded ? 'Click to collapse' : 'Click to expand'}
                >
                    {template.designRationale}
                </span>
            </div>

            {/* Actions: Hide (dismiss banner) and Clear template (detach workload) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                    onClick={onDismiss}
                    style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#94a3b8',
                        background: 'rgba(148, 163, 184, 0.15)',
                        border: '1px solid #475569',
                        borderRadius: 6,
                        cursor: 'pointer',
                    }}
                    title="Hide this banner"
                >
                    Hide
                </button>
                <button
                    onClick={onClearTemplate}
                    style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#f87171',
                        background: 'rgba(248, 113, 113, 0.15)',
                        border: '1px solid rgba(248, 113, 113, 0.4)',
                        borderRadius: 6,
                        cursor: 'pointer',
                    }}
                    title="Detach template workload"
                >
                    Clear template
                </button>
            </div>
        </div>
    );
}

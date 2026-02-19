/**
 * ComponentPalette — sidebar with draggable components organized by category tabs.
 * Excalidraw-inspired dark theme.
 */
'use client';

import { useState, useCallback } from 'react';
import { COMPONENT_CATALOG, CATEGORIES, getCatalogByCategory } from '@/lib/data/componentCatalog';
import type { ComponentCatalogEntry } from '@/lib/types/canvas';

interface ComponentPaletteProps {
    className?: string;
}

export default function ComponentPalette({ className }: ComponentPaletteProps) {
    const [activeTab, setActiveTab] = useState<string>('traffic');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredComponents = searchQuery
        ? COMPONENT_CATALOG.filter(
            (c) =>
                c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.description.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        : getCatalogByCategory(activeTab);

    return (
        <div
            className={className}
            style={{
                width: 220,
                height: '100%',
                background: '#181e2e',
                borderRight: '1px solid #2a3244',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            {/* Header */}
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #2a3244' }}>
                <h3
                    style={{
                        margin: 0,
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                    }}
                >
                    Components
                </h3>
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        marginTop: 8,
                        width: '100%',
                        padding: '6px 10px',
                        background: '#121826',
                        border: '1px solid #2a3244',
                        borderRadius: 6,
                        color: '#e2e8f0',
                        fontSize: 12,
                        outline: 'none',
                    }}
                />
            </div>

            {/* Category tabs */}
            {!searchQuery && (
                <div
                    style={{
                        display: 'flex',
                        gap: 2,
                        padding: '6px 8px',
                        borderBottom: '1px solid #2a3244',
                        flexWrap: 'wrap',
                    }}
                >
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveTab(cat.id)}
                            title={cat.label}
                            style={{
                                padding: '4px 8px',
                                fontSize: 14,
                                background: activeTab === cat.id ? '#2a3244' : 'transparent',
                                border: '1px solid',
                                borderColor: activeTab === cat.id ? '#3b4a5f' : 'transparent',
                                borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            {cat.icon}
                        </button>
                    ))}
                </div>
            )}

            {/* Component list */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                }}
            >
                {filteredComponents.map((comp) => (
                    <PaletteItem key={comp.type} entry={comp} />
                ))}

                {filteredComponents.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: 12 }}>
                        {searchQuery ? 'No components match' : 'Coming soon'}
                    </div>
                )}
            </div>
        </div>
    );
}

function PaletteItem({ entry }: { entry: ComponentCatalogEntry }) {
    const isEnabled = entry.priority === 'p1';
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (!isEnabled) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('application/syscrack-component', entry.type);
            e.dataTransfer.effectAllowed = 'copy';
            setIsDragging(true);
        },
        [entry.type, isEnabled],
    );

    return (
        <div
            draggable={isEnabled}
            onDragStart={handleDragStart}
            onDragEnd={() => setIsDragging(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                background: isDragging ? '#1e3a5f' : '#181e2e',
                border: '1px solid',
                borderColor: isDragging ? '#3b82f6' : '#2a3244',
                borderRadius: 8,
                cursor: isEnabled ? 'grab' : 'not-allowed',
                opacity: isEnabled ? 1 : 0.4,
                transition: 'all 0.15s',
                userSelect: 'none',
            }}
            onMouseEnter={(e) => {
                if (isEnabled) {
                    (e.currentTarget).style.borderColor = '#3b4a5f';
                    (e.currentTarget).style.background = '#1e2638';
                }
            }}
            onMouseLeave={(e) => {
                if (!isDragging) {
                    (e.currentTarget).style.borderColor = '#2a3244';
                    (e.currentTarget).style.background = '#181e2e';
                }
            }}
        >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{entry.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#e2e8f0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {entry.label}
                    {!isEnabled && ' 🔒'}
                </div>
                <div
                    style={{
                        fontSize: 10,
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {entry.description.split('—')[0]?.trim()}
                </div>
            </div>
        </div>
    );
}

/**
 * ComponentPalette — sidebar with draggable components organized by category tabs.
 * Excalidraw-inspired dark theme.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { COMPONENT_CATALOG, CATEGORIES, getCatalogByCategory } from '@/lib/data/componentCatalog';
import type { ComponentCatalogEntry, ComponentCategory } from '@/lib/types/canvas';

// Category border colors by component type (mirrors ComponentNode; kept local to avoid circular deps)
const CATEGORY_BORDER_COLORS: Record<string, string> = {
    client: '#06b6d4',
    cdn: '#06b6d4',
    load_balancer: '#8b5cf6',
    api_gateway: '#8b5cf6',
    dns: '#8b5cf6',
    proxy: '#8b5cf6',
    app_server: '#3b82f6',
    serverless: '#3b82f6',
    worker: '#3b82f6',
    message_queue: '#f59e0b',
    pub_sub: '#f59e0b',
    cdc_connector: '#f59e0b',
    database_sql: '#10b981',
    database_nosql: '#10b981',
    cache: '#10b981',
    object_store: '#10b981',
    default: '#475569',
};

interface ComponentPaletteProps {
    className?: string;
    collapsed?: boolean;
    onToggle?: () => void;
}

export default function ComponentPalette({ className, collapsed = false, onToggle }: ComponentPaletteProps) {
    const [activeTab, setActiveTab] = useState<ComponentCategory>('traffic');
    const [searchQuery, setSearchQuery] = useState('');

    // Phase 4: show all P1 components (catalog + simulation models exist for all)
    const paletteCatalog = COMPONENT_CATALOG.filter((c) => c.priority === 'p1');
    const paletteCategories = new Set<ComponentCategory>(paletteCatalog.map((c) => c.category));
    const visibleCategories = CATEGORIES.filter((cat) => paletteCategories.has(cat.id as ComponentCategory));

    // Ensure activeTab is valid (has palette components)
    useEffect(() => {
        if (!paletteCategories.has(activeTab) && visibleCategories.length > 0) {
            setActiveTab(visibleCategories[0].id as ComponentCategory);
        }
    }, [activeTab, paletteCategories, visibleCategories]);

    const filteredComponents = searchQuery
        ? paletteCatalog.filter(
            (c) =>
                c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.description.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        : paletteCatalog.filter((c) => c.category === activeTab);

    return (
        <div
            className={className}
            style={{
                width: collapsed ? 36 : 220,
                height: '100%',
                background: '#181e2e',
                borderRight: '1px solid #2a3244',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, system-ui, sans-serif',
                transition: 'width 0.2s ease',
            }}
        >
            {collapsed ? (
                <button
                    type="button"
                    onClick={onToggle}
                    title="Expand palette"
                    style={{
                        width: '100%',
                        height: '100%',
                        minHeight: 120,
                        padding: 8,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    ▶
                </button>
            ) : (
                <>
            {/* Header */}
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #2a3244' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
                    {onToggle && (
                        <button
                            type="button"
                            onClick={onToggle}
                            title="Collapse palette"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#64748b',
                                fontSize: 12,
                                padding: '2px 4px',
                            }}
                        >
                            ◀
                        </button>
                    )}
                </div>
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
                    {visibleCategories.map((cat) => (
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
                </>
            )}
        </div>
    );
}

function PaletteItem({ entry }: { entry: ComponentCatalogEntry }) {
    const isEnabled = entry.priority === 'p1';
    const [isDragging, setIsDragging] = useState(false);
    const categoryColor = CATEGORY_BORDER_COLORS[entry.type] ?? CATEGORY_BORDER_COLORS.default;
    const borderLeftDefault = `3px solid ${categoryColor}99`;
    const borderLeftHover = `3px solid ${categoryColor}`;
    const bgHover = `${categoryColor}0F`;

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
                paddingLeft: 10,
                borderLeft: borderLeftDefault,
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
                    const el = e.currentTarget;
                    el.style.borderColor = '#3b4a5f';
                    el.style.background = isDragging ? '#1e3a5f' : bgHover;
                    el.style.borderLeft = borderLeftHover;
                }
            }}
            onMouseLeave={(e) => {
                if (!isDragging) {
                    const el = e.currentTarget;
                    el.style.borderColor = '#2a3244';
                    el.style.background = '#181e2e';
                    el.style.borderLeft = borderLeftDefault;
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

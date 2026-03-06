'use client';

import React, { useState } from 'react';
import { ALL_TEMPLATES, getTemplateById } from '@/lib/templates';
import type { ScenarioTemplate, TemplateDifficulty } from '@/lib/templates';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCanvasSimulationStore } from '@/stores/canvasSimulationStore';

interface TemplatePickerProps {
    open: boolean;
    onClose: () => void;
}

const DIFFICULTY_COLORS: Record<TemplateDifficulty, { bg: string; text: string }> = {
    beginner: { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80' },
    intermediate: { bg: 'rgba(250, 204, 21, 0.15)', text: '#facc15' },
    advanced: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
};

export default function TemplatePicker({ open, onClose }: TemplatePickerProps) {
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    if (!open) return null;

    function handleLoad(template: ScenarioTemplate) {
        const store = useCanvasStore.getState();
        if (store.hasUnsavedWork()) {
            setConfirmingId(template.id);
        } else {
            // Stop any running simulation before replacing the canvas
            useCanvasSimulationStore.getState().reset();
            store.loadTemplate(template);
            setConfirmingId(null);
            onClose();
        }
    }

    function confirmLoad(templateId: string) {
        const template = getTemplateById(templateId);
        if (!template) return;
        // Stop any running simulation before replacing the canvas
        useCanvasSimulationStore.getState().reset();
        useCanvasStore.getState().loadTemplate(template);
        setConfirmingId(null);
        onClose();
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 860,
                    maxHeight: '85vh',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 16,
                    padding: '28px 32px',
                    overflowY: 'auto',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
                        Start from a Template
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            fontSize: 22,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: 6,
                            lineHeight: 1,
                        }}
                        title="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Card Grid */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {ALL_TEMPLATES.map((t) => (
                        <div
                            key={t.id}
                            style={{
                                flex: '1 1 240px',
                                maxWidth: 'calc(33.333% - 11px)',
                                minWidth: 220,
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: 12,
                                padding: '20px 18px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                transition: 'border-color 0.15s',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#475569'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; }}
                        >
                            {confirmingId === t.id ? (
                                /* Confirm state */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                                        This will replace your current canvas.<br />
                                        <span style={{ color: '#64748b' }}>Your work is auto-saved.</span>
                                    </p>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => confirmLoad(t.id)}
                                            style={{
                                                padding: '7px 16px',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                color: '#fff',
                                                background: 'rgba(59, 130, 246, 0.8)',
                                                border: '1px solid rgba(59, 130, 246, 0.6)',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Load anyway
                                        </button>
                                        <button
                                            onClick={() => setConfirmingId(null)}
                                            style={{
                                                padding: '7px 16px',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                color: '#94a3b8',
                                                background: 'rgba(100, 116, 139, 0.15)',
                                                border: '1px solid #334155',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Normal card */
                                <>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
                                        {t.name}
                                    </div>

                                    {/* Badges row */}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: 99,
                                            background: DIFFICULTY_COLORS[t.difficulty].bg,
                                            color: DIFFICULTY_COLORS[t.difficulty].text,
                                        }}>
                                            {t.difficulty}
                                        </span>
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: 99,
                                            background: 'rgba(100, 116, 139, 0.15)',
                                            color: '#94a3b8',
                                        }}>
                                            {t.category}
                                        </span>
                                    </div>

                                    {/* Description */}
                                    <p style={{
                                        fontSize: 13,
                                        color: '#94a3b8',
                                        lineHeight: 1.45,
                                        margin: 0,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        flex: 1,
                                    }}>
                                        {t.description}
                                    </p>

                                    {/* Tags */}
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {t.tags.slice(0, 3).map((tag) => (
                                            <span
                                                key={tag}
                                                style={{
                                                    fontSize: 11,
                                                    padding: '1px 7px',
                                                    borderRadius: 4,
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    color: '#60a5fa',
                                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                                }}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Load button */}
                                    <button
                                        onClick={() => handleLoad(t)}
                                        style={{
                                            width: '100%',
                                            padding: '9px 0',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: '#bfdbfe',
                                            background: 'rgba(59, 130, 246, 0.12)',
                                            border: '1px solid rgba(59, 130, 246, 0.4)',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            marginTop: 4,
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.25)'; }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.12)'; }}
                                    >
                                        Load Template
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

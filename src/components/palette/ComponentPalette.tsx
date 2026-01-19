'use client';

import { DragEvent } from 'react';
import {
    COMPONENT_TEMPLATES,
    getAllComponentTypes,
    type ComponentType,
    type ComponentTemplate
} from '@/lib/templates/componentTemplates';

interface ComponentPaletteProps {
    className?: string;
}

export function ComponentPalette({ className = '' }: ComponentPaletteProps) {
    const componentTypes = getAllComponentTypes();

    const handleDragStart = (e: DragEvent<HTMLDivElement>, template: ComponentTemplate) => {
        // Pass the full template data for the drop handler
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: template.type,
            icon: template.visual.icon,
            label: template.visual.label,
            color: template.visual.strokeColor,
            visual: template.visual,
            defaultConfig: template.defaultConfig,
        }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <div
            className={`
                absolute top-4 left-4 z-50
                w-52 
                bg-[var(--color-panel-bg)]/95 backdrop-blur-md
                border border-[var(--color-border)]
                rounded-xl shadow-lg
                overflow-hidden
                ${className}
            `}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Components</h3>
            </div>

            {/* Component List */}
            <div className="p-2 space-y-1">
                {componentTypes.map((type) => {
                    const template = COMPONENT_TEMPLATES[type];
                    return (
                        <div
                            key={type}
                            draggable
                            onDragStart={(e) => handleDragStart(e, template)}
                            className="
                                flex items-center gap-3
                                px-3 py-2
                                rounded-lg
                                cursor-grab active:cursor-grabbing
                                hover:bg-[var(--color-surface)]
                                transition-colors
                                select-none
                            "
                            style={{ borderLeft: `4px solid ${template.visual.strokeColor}` }}
                        >
                            <span className="text-lg" role="img" aria-label={template.visual.label}>
                                {template.visual.icon}
                            </span>
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                {template.visual.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/50">
                <p className="text-xs text-[var(--color-text-tertiary)] text-center">
                    Drag components onto the canvas
                </p>
            </div>
        </div>
    );
}

export default ComponentPalette;

// Re-export ComponentType for use elsewhere
export type { ComponentType };

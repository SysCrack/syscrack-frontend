'use client';

/**
 * ComponentPalette - Draggable component buttons for the design canvas
 * 
 * Simple v1 implementation with emoji + text buttons.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { COMPONENT_TEMPLATES, type ComponentTemplate } from '@/lib/templates/componentTemplates';

interface ComponentPaletteProps {
    className?: string;
    isMenuOpen?: boolean;
}

export function ComponentPalette({ className = '', isMenuOpen = false }: ComponentPaletteProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleDragStart = (e: React.DragEvent, template: ComponentTemplate) => {
        // Set the component type in the drag data
        e.dataTransfer.setData('application/syscrack-component', JSON.stringify({
            type: template.type,
            label: template.label,
            icon: template.icon,
            color: template.color,
            defaultConfig: template.defaultConfig,
        }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <div
            className={`
        absolute left-4 top-24 z-[60]
        bg-[var(--color-surface)] rounded-lg shadow-lg border border-[var(--color-border)]
        p-3 w-52 flex flex-col
        max-h-[calc(100%-8rem)]
        transition-transform duration-200 ease-in-out
        ${isMenuOpen ? 'translate-y-[280px]' : 'translate-y-0'}
        ${className}
      `}
        >
            <div
                className="flex items-center justify-between cursor-pointer mb-2 px-1 flex-shrink-0 select-none"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsCollapsed(!isCollapsed);
                }}
            >
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Components
                </h3>
                {isCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                ) : (
                    <ChevronUp className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                )}
            </div>

            {!isCollapsed && (
                <>
                    <div className="space-y-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                        {COMPONENT_TEMPLATES.map((template) => (
                            <button
                                key={template.type}
                                draggable
                                onDragStart={(e) => handleDragStart(e, template)}
                                className="
                  w-full flex items-center gap-2 px-2 py-2
                  rounded-md text-sm text-left flex-shrink-0
                  hover:bg-[var(--color-bg-secondary)] active:bg-[var(--color-bg-tertiary)]
                  cursor-grab active:cursor-grabbing
                  transition-colors
                "
                                style={{
                                    borderLeft: `3px solid ${template.color}`,
                                }}
                            >
                                <span className="text-base">{template.icon}</span>
                                <span className="text-[var(--color-text-secondary)]">{template.label}</span>
                            </button>
                        ))}
                    </div>

                    <p className="text-xs text-[var(--color-text-tertiary)] mt-3 px-1 text-center flex-shrink-0">
                        Drag onto canvas
                    </p>
                </>
            )}
        </div>
    );
}

export default ComponentPalette;

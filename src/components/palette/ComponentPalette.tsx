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
    collapsed?: boolean;
    onToggle?: (collapsed: boolean) => void;
}

export function ComponentPalette({ className = '', collapsed, onToggle }: ComponentPaletteProps) {
    const [isCollapsedLocal, setIsCollapsedLocal] = useState(false);

    const isCollapsed = collapsed !== undefined ? collapsed : isCollapsedLocal;
    const handleToggle = () => {
        const newState = !isCollapsed;
        if (onToggle) {
            onToggle(newState);
        } else {
            setIsCollapsedLocal(newState);
        }
    };

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
        absolute right-4 bottom-28 z-[60]
        bg-[var(--color-surface)] rounded-lg shadow-lg border border-[var(--color-border)]
        p-3 w-52 flex flex-col-reverse
        max-h-[60vh]
        transition-transform duration-200 ease-in-out
        ${className}
      `}
        >
            <div
                className="flex items-center justify-between cursor-pointer mt-2 px-1 flex-shrink-0 select-none border-t border-[var(--color-border)] pt-2"
                onClick={(e) => {
                    e.stopPropagation();
                    handleToggle();
                }}
            >
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Components
                </h3>
                {isCollapsed ? (
                    <ChevronUp className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                )}
            </div>

            {!isCollapsed && (
                <>
                    <div className="space-y-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar mb-1 flex flex-col-reverse">
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

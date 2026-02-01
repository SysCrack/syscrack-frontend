'use client';

import { X, Command, CornerDownLeft, Save, Play, HelpCircle, RotateCcw, RotateCw, Trash2 } from 'lucide-react';

interface ShortcutItemProps {
    keys: string[];
    description: string;
    icon?: React.ReactNode;
}

function ShortcutItem({ keys, description, icon }: ShortcutItemProps) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
            <div className="flex items-center gap-3">
                <div className="text-[var(--color-text-secondary)]">
                    {icon}
                </div>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{description}</span>
            </div>
            <div className="flex gap-1.5">
                {keys.map((key, i) => (
                    <kbd
                        key={i}
                        className="px-2 py-1 min-w-[24px] text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-sm text-xs font-sans font-semibold text-[var(--color-text-primary)]"
                    >
                        {key}
                    </kbd>
                ))}
            </div>
        </div>
    );
}

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
    if (!isOpen) return null;

    const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const modKey = isMac ? '⌘' : 'Ctrl';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]/50">
                    <div className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-[var(--color-primary)]" />
                        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Keyboard Shortcuts</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                    <section className="mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">General Actions</h3>
                        <ShortcutItem icon={<Save className="h-4 w-4" />} keys={[modKey, 'S']} description="Save Design" />
                        <ShortcutItem icon={<Play className="h-4 w-4" />} keys={[modKey, 'Enter']} description="Run Simulation" />
                        <ShortcutItem icon={<HelpCircle className="h-4 w-4" />} keys={['?']} description="Show Shortcuts" />
                        <ShortcutItem keys={['Esc']} description="Close Panel / Modal" />
                    </section>

                    <section className="mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">Canvas Controls</h3>
                        <ShortcutItem icon={<RotateCcw className="h-4 w-4" />} keys={[modKey, 'Z']} description="Undo" />
                        <ShortcutItem icon={<RotateCw className="h-4 w-4" />} keys={[modKey, 'Y']} description="Redo" />
                        <ShortcutItem icon={<Trash2 className="h-4 w-4" />} keys={['Del']} description="Delete Selected" />
                    </section>
                </div>

                <div className="px-6 py-3 bg-[var(--color-surface)] border-t border-[var(--color-border)] text-center">
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                        Power user shortcuts for faster system design.
                    </p>
                </div>
            </div>
        </div>
    );
}

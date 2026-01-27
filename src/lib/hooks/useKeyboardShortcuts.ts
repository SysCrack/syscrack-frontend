import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
    onSave?: () => void;
    onRun?: () => void;
    onToggleHelp?: () => void;
    onEsc?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
}

/**
 * Custom hook to handle global keyboard shortcuts.
 * Focuses on custom application actions like Save and Run Simulation.
 */
export const useKeyboardShortcuts = ({
    onSave,
    onRun,
    onToggleHelp,
    onEsc,
    onUndo,
    onRedo
}: UseKeyboardShortcutsProps) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const isMod = event.ctrlKey || event.metaKey;
            const target = event.target as HTMLElement;
            const isInput =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            // Save: Ctrl/Cmd + S
            if (isMod && event.key.toLowerCase() === 's') {
                event.preventDefault();
                onSave?.();
                return;
            }

            // Run: Ctrl/Cmd + Enter
            if (isMod && event.key === 'Enter') {
                event.preventDefault();
                onRun?.();
                return;
            }

            // Help: Shift + ? (standard shortcut for help)
            if (event.key === '?' && !isInput) {
                event.preventDefault();
                onToggleHelp?.();
                return;
            }

            // Esc: Close modals/panels
            if (event.key === 'Escape') {
                onEsc?.();
                return;
            }

            // Undo/Redo: Excalidraw handles these, but we can intercept if needed.
            // For now, we let Excalidraw handle its own built-in shortcuts unless specified.
            if (isMod && !isInput) {
                if (event.key.toLowerCase() === 'z') {
                    if (event.shiftKey) {
                        onRedo?.();
                    } else {
                        onUndo?.();
                    }
                } else if (event.key.toLowerCase() === 'y') {
                    onRedo?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSave, onRun, onToggleHelp, onEsc, onUndo, onRedo]);
};

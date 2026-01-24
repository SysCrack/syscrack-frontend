'use client';

import { useCallback } from 'react';
import { Save, Loader2, Check } from 'lucide-react';
import { useDesignStore } from '@/stores/designStore';

interface SaveDesignButtonProps {
    onSave: () => Promise<void>;
}

export function SaveDesignButton({ onSave }: SaveDesignButtonProps) {
    const isDirty = useDesignStore((state) => state.isDirty);
    const isSaving = useDesignStore((state) => state.isSaving);
    const saveError = useDesignStore((state) => state.saveError);

    const handleSave = useCallback(async () => {
        if (isSaving) return;
        await onSave();
    }, [isSaving, onSave]);

    // Determine button appearance
    const isDisabled = isSaving;
    const showSaved = !isDirty && !isSaving && !saveError;

    return (
        <button
            onClick={handleSave}
            disabled={isDisabled}
            className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${showSaved
                    ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                    : isDirty
                        ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] shadow-md'
                        : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
                }
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
            {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : showSaved ? (
                <Check className="h-4 w-4" />
            ) : (
                <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : showSaved ? 'Saved' : isDirty ? 'Save' : 'Saved'}
        </button>
    );
}

export default SaveDesignButton;

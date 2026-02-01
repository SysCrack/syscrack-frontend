import { useEffect, useRef } from 'react';
import { useDesignStore } from '@/stores/designStore';

/**
 * Custom hook for debounced auto-saving.
 * @param saveFn The asynchronous function to call when saving.
 * @param delay The debounce delay in milliseconds (default 3000ms).
 */
export const useAutoSave = (saveFn: () => Promise<void>, delay = 3000) => {
    const isDirty = useDesignStore((state) => state.isDirty);
    const isSaving = useDesignStore((state) => state.isSaving);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // If there's dirt on the canvas and we aren't already saving,
        // start a timer to save.
        if (isDirty && !isSaving) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);

            timeoutRef.current = setTimeout(async () => {
                try {
                    await saveFn();
                } catch (err) {
                    console.error('Auto-save failed:', err);
                }
            }, delay);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isDirty, isSaving, saveFn, delay]);
};

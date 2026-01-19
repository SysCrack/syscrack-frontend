/**
 * Zustand store for design state management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DesignStore {
    // State
    currentDesignId: number | null;
    problemId: number | null;
    isDirty: boolean;
    isSaving: boolean;
    lastSavedAt: Date | null;
    saveError: string | null;

    // Actions
    setDesignId: (id: number | null) => void;
    setProblemId: (id: number | null) => void;
    markDirty: () => void;
    startSaving: () => void;
    markSaved: () => void;
    setSaveError: (error: string | null) => void;
    reset: () => void;
}

export const useDesignStore = create<DesignStore>()(
    persist(
        (set) => ({
            // Initial state
            currentDesignId: null,
            problemId: null,
            isDirty: false,
            isSaving: false,
            lastSavedAt: null,
            saveError: null,

            // Actions
            setDesignId: (id) => set({ currentDesignId: id }),

            setProblemId: (id) => set({ problemId: id }),

            markDirty: () => set({ isDirty: true, saveError: null }),

            startSaving: () => set({ isSaving: true, saveError: null }),

            markSaved: () => set({
                isDirty: false,
                isSaving: false,
                lastSavedAt: new Date(),
                saveError: null,
            }),

            setSaveError: (error) => set({
                isSaving: false,
                saveError: error,
            }),

            reset: () => set({
                currentDesignId: null,
                problemId: null,
                isDirty: false,
                isSaving: false,
                lastSavedAt: null,
                saveError: null,
            }),
        }),
        {
            name: 'syscrack-design-store',
            partialize: (state) => ({
                currentDesignId: state.currentDesignId,
                problemId: state.problemId,
            }),
        }
    )
);

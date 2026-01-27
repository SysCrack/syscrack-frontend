/**
 * Zustand store for design state management
 * 
 * Manages canvas elements, selection state, and save status.
 * Uses immer middleware for easier state updates.
 * Persists design ID and problem ID to localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';

interface DesignStore {
    // State
    currentDesignId: number | null;
    problemId: number | null;
    elements: ExcalidrawElement[];
    selectedElementId: string | null;
    isDirty: boolean;
    isSaving: boolean;
    lastSavedAt: Date | null;
    saveError: string | null;

    // Actions
    setDesignId: (id: number | null) => void;
    setProblemId: (id: number | null) => void;
    setElements: (elements: ExcalidrawElement[]) => void;
    selectElement: (id: string | null) => void;
    updateElementConfig: (id: string, config: Record<string, unknown>) => void;
    markDirty: () => void;
    startSaving: () => void;
    markSaved: () => void;
    setSaveError: (error: string | null) => void;
    reset: () => void;
}

export const useDesignStore = create<DesignStore>()(
    persist(
        immer((set, get) => ({
            // Initial state
            currentDesignId: null,
            problemId: null,
            elements: [],
            selectedElementId: null,
            isDirty: false,
            isSaving: false,
            lastSavedAt: null,
            saveError: null,

            // Actions
            setDesignId: (id) => set({ currentDesignId: id }),

            setProblemId: (id) => set({ problemId: id }),

            setElements: (elements) => set((state) => {
                state.elements = elements as any; // Cast for immer compatibility
            }),

            selectElement: (id) => set({ selectedElementId: id }),

            updateElementConfig: (id, config) => set((state) => {
                const elementIndex = state.elements.findIndex((el) => el.id === id);
                if (elementIndex !== -1) {
                    const element = state.elements[elementIndex];
                    if (element.customData) {
                        (element.customData as any).componentConfig = {
                            ...(element.customData as any).componentConfig,
                            ...config,
                        };
                    }
                    state.isDirty = true;
                }
            }),

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
                elements: [],
                selectedElementId: null,
                isDirty: false,
                isSaving: false,
                lastSavedAt: null,
                saveError: null,
            }),
        })),
        {
            name: 'syscrack-design-store',
            // Only persist IDs, not the full elements array (too large)
            partialize: (state) => ({
                currentDesignId: state.currentDesignId,
                problemId: state.problemId,
            }),
        }
    )
);

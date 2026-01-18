"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface EditorState {
  // Code stored per problem ID
  code: Record<number, string>;
  // Editor preferences
  fontSize: number;

  // Actions
  getCode: (problemId: number) => string | undefined;
  setCode: (problemId: number, code: string) => void;
  resetCode: (problemId: number, starterCode: string) => void;
  setFontSize: (size: number) => void;
  clearCode: (problemId: number) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      code: {},
      fontSize: 14,

      getCode: (problemId: number) => {
        return get().code[problemId];
      },

      setCode: (problemId: number, code: string) => {
        set((state) => ({
          code: {
            ...state.code,
            [problemId]: code,
          },
        }));
      },

      resetCode: (problemId: number, starterCode: string) => {
        set((state) => ({
          code: {
            ...state.code,
            [problemId]: starterCode,
          },
        }));
      },

      setFontSize: (size: number) => {
        set({ fontSize: Math.max(10, Math.min(24, size)) });
      },

      clearCode: (problemId: number) => {
        set((state) => {
          const newCode = { ...state.code };
          delete newCode[problemId];
          return { code: newCode };
        });
      },
    }),
    {
      name: "syscrack-editor-storage",
      storage: createJSONStorage(() => {
        // Return a noop storage for SSR
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      skipHydration: true,
    }
  )
);

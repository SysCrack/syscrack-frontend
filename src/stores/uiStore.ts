"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Theme = "light" | "dark";

interface UIState {
  theme: Theme;
  isProblemPanelCollapsed: boolean;
  problemPanelWidth: number;
  isResultsPanelOpen: boolean;
  resultsPanelHeight: number;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleProblemPanel: () => void;
  setProblemPanelWidth: (width: number) => void;
  setIsResultsPanelOpen: (isOpen: boolean) => void;
  setResultsPanelHeight: (height: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "light",
      isProblemPanelCollapsed: false,
      problemPanelWidth: 480,
      isResultsPanelOpen: false,
      resultsPanelHeight: 300,

      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document (only on client)
        if (typeof window !== "undefined") {
          document.documentElement.setAttribute("data-theme", theme);
        }
      },

      toggleTheme: () => {
        const newTheme = get().theme === "light" ? "dark" : "light";
        get().setTheme(newTheme);
      },

      toggleProblemPanel: () => {
        set((state) => ({
          isProblemPanelCollapsed: !state.isProblemPanelCollapsed,
        }));
      },

      setProblemPanelWidth: (width) => {
        set({ problemPanelWidth: Math.max(280, Math.min(800, width)) });
      },

      setIsResultsPanelOpen: (isOpen) => {
        set({ isResultsPanelOpen: isOpen });
      },

      setResultsPanelHeight: (height) => {
        set({ resultsPanelHeight: Math.max(200, Math.min(600, height)) });
      },
    }),
    {
      name: "syscrack-ui-storage",
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

"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/uiStore";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Rehydrate the store on client
    useUIStore.persist.rehydrate();
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      // Get the theme from store after hydration
      const theme = useUIStore.getState().theme;
      document.documentElement.setAttribute("data-theme", theme);
      
      // Subscribe to theme changes
      const unsubscribe = useUIStore.subscribe((state) => {
        document.documentElement.setAttribute("data-theme", state.theme);
      });

      return () => unsubscribe();
    }
  }, [mounted]);

  return <>{children}</>;
}

"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const initialize = useAuthStore((state) => state.initialize);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Initialize auth and store cleanup function
    initialize().then((cleanup) => {
      cleanupRef.current = cleanup;
    });

    return () => {
      // Cleanup subscription when component unmounts
      cleanupRef.current?.();
    };
  }, [initialize]);

  return <>{children}</>;
}

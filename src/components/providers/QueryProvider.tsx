"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 5 minutes stale time
        staleTime: 5 * 60 * 1000,
        // 10 minutes cache time
        gcTime: 10 * 60 * 1000,
        // Retry twice on failure
        retry: (failureCount, error) => {
          // Don't retry on auth errors
          if (error instanceof ApiError && error.status === 401) {
            return false;
          }
          return failureCount < 2;
        },
        // Refetch on window focus
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient());
  const signOut = useAuthStore((state) => state.signOut);

  // Set up global error handler
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: {
      ...queryClient.getDefaultOptions().queries,
      throwOnError: (error) => {
        // Handle 401 errors globally - sign out user
        if (error instanceof ApiError && error.status === 401) {
          signOut();
          return false;
        }
        return false;
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}


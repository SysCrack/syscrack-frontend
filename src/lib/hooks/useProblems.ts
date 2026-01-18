"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchProblems,
  fetchProblemBySlug,
  type FetchProblemsParams,
} from "@/lib/api/problems";

/**
 * Hook to fetch list of problems
 */
export function useProblems(params?: FetchProblemsParams) {
  return useQuery({
    queryKey: ["problems", params],
    queryFn: () => fetchProblems(params),
  });
}

interface UseProblemOptions {
  enabled?: boolean;
}

/**
 * Hook to fetch a single problem by slug
 * @param slug - Problem slug
 * @param options - Optional configuration (enabled flag)
 */
export function useProblem(slug: string | undefined, options?: UseProblemOptions) {
  const isEnabled = options?.enabled !== false && !!slug;
  
  return useQuery({
    queryKey: ["problems", "slug", slug],
    queryFn: () => fetchProblemBySlug(slug!),
    enabled: isEnabled,
    retry: (failureCount, error) => {
      // Don't retry on 401 (unauthorized) or 403 (forbidden)
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("401") || message.includes("403") || message.includes("404")) {
          return false;
        }
      }
      return failureCount < 2;
    },
  });
}


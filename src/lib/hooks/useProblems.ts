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

/**
 * Hook to fetch a single problem by slug
 */
export function useProblem(slug: string | undefined) {
  return useQuery({
    queryKey: ["problems", "slug", slug],
    queryFn: () => fetchProblemBySlug(slug!),
    enabled: !!slug,
  });
}


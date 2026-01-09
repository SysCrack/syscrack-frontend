"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  submitSolution,
  fetchSubmissions,
  fetchProblemSubmissions,
  type Submission,
} from "@/lib/api/submissions";

/**
 * Hook to fetch user's submission history
 */
export function useSubmissions(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["submissions", { limit, offset }],
    queryFn: () => fetchSubmissions(limit, offset),
  });
}

/**
 * Hook to fetch submissions for a specific problem
 */
export function useProblemSubmissions(problemId: number | undefined, limit = 20) {
  return useQuery({
    queryKey: ["submissions", "problem", problemId, { limit }],
    queryFn: () => fetchProblemSubmissions(problemId!, limit),
    enabled: !!problemId,
  });
}

/**
 * Hook to submit a solution
 */
export function useSubmitSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ problemId, code }: { problemId: number; code: string }) =>
      submitSolution(problemId, code),
    onSuccess: (data: Submission) => {
      // Invalidate submissions cache
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      queryClient.invalidateQueries({
        queryKey: ["submissions", "problem", data.problem_id],
      });
    },
  });
}


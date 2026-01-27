import { apiFetch } from "./client";

// Types based on API documentation
export interface ProblemListItem {
  id: number;
  title: string;
  slug: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  is_premium_only: boolean;
}

export interface ProblemDetail extends ProblemListItem {
  description: string;
  starter_code: string;
  requirements: Record<string, unknown>;
  test_scenarios: string[];
  hints?: string[];
}

export interface FetchProblemsParams {
  difficulty?: "easy" | "medium" | "hard";
  topic?: string;
}

/**
 * Fetch all problems (public endpoint, no auth required)
 */
export async function fetchProblems(
  params?: FetchProblemsParams
): Promise<ProblemListItem[]> {
  const searchParams = new URLSearchParams();

  if (params?.difficulty) {
    searchParams.set("difficulty", params.difficulty);
  }
  if (params?.topic) {
    searchParams.set("topic", params.topic);
  }

  const query = searchParams.toString();
  const endpoint = `/problems${query ? `?${query}` : ""}`;

  return await apiFetch<ProblemListItem[]>(endpoint, {}, false);
}

/**
 * Fetch a single problem by ID (requires auth)
 */
export async function fetchProblemById(id: number): Promise<ProblemDetail> {
  return apiFetch<ProblemDetail>(`/problems/${id}`, {}, true);
}

/**
 * Fetch a single problem by slug (requires auth)
 */
export async function fetchProblemBySlug(slug: string): Promise<ProblemDetail> {
  return apiFetch<ProblemDetail>(`/problems/slug/${slug}`, {}, true);
}

// ============ System Design Problems ============

import type { SystemDesignProblemList, SystemDesignProblemDetail } from '@/lib/types/design';

/**
 * Fetch all system design problems (public endpoint)
 */
export async function fetchSystemDesignProblems(): Promise<SystemDesignProblemDetail[]> {
  try {
    return await apiFetch<SystemDesignProblemDetail[]>('/system-design-problems', {}, false);
  } catch (error) {
    console.warn("API unavailable for system design problems:", error);
    return [];
  }
}

/**
 * Fetch a system design problem by ID (requires auth)
 */
export async function fetchSystemDesignProblem(id: number): Promise<SystemDesignProblemDetail> {
  return apiFetch<SystemDesignProblemDetail>(`/system-design-problems/${id}`, {}, true);
}

/**
 * Fetch a system design problem by slug (requires auth)
 */
export async function fetchSystemDesignProblemBySlug(slug: string): Promise<SystemDesignProblemDetail> {
  return apiFetch<SystemDesignProblemDetail>(`/system-design-problems/slug/${slug}`, {}, true);
}

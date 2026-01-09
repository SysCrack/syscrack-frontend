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
  
  return apiFetch<ProblemListItem[]>(endpoint, {}, false);
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


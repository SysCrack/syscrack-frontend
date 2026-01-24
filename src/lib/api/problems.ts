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
 * Mock problems for development when backend is unavailable
 */
const MOCK_PROBLEMS: ProblemListItem[] = [
  { id: 1, title: "Design a URL Shortener", slug: "url-shortener", difficulty: "medium", topic: "System Design", is_premium_only: false },
  { id: 2, title: "Design Twitter Feed", slug: "twitter-feed", difficulty: "hard", topic: "System Design", is_premium_only: false },
  { id: 3, title: "Design a Rate Limiter", slug: "rate-limiter", difficulty: "medium", topic: "System Design", is_premium_only: false },
  { id: 4, title: "Design a Chat System", slug: "chat-system", difficulty: "hard", topic: "System Design", is_premium_only: true },
  { id: 5, title: "Design a Key-Value Store", slug: "key-value-store", difficulty: "hard", topic: "System Design", is_premium_only: false },
  { id: 6, title: "Design a Notification Service", slug: "notification-service", difficulty: "medium", topic: "System Design", is_premium_only: false },
  { id: 7, title: "Design a Search Autocomplete", slug: "search-autocomplete", difficulty: "medium", topic: "System Design", is_premium_only: true },
  { id: 8, title: "Design a Video Streaming Service", slug: "video-streaming", difficulty: "hard", topic: "System Design", is_premium_only: true },
];

/**
 * Fetch all problems (public endpoint, no auth required)
 * Falls back to mock data if API is unavailable
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

  try {
    return await apiFetch<ProblemListItem[]>(endpoint, {}, false);
  } catch (error) {
    console.warn("API unavailable, using mock problems:", error);
    // Filter mock data based on params
    let filtered = MOCK_PROBLEMS;
    if (params?.difficulty) {
      filtered = filtered.filter(p => p.difficulty === params.difficulty);
    }
    return filtered;
  }
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

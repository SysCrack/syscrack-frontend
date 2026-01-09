import { apiFetch } from "./client";

export interface SubmissionFeedback {
  messages: string[];
  issues: Array<{
    issue_type: string;
    severity: string;
    message: string;
  }>;
}

export interface Submission {
  id: number;
  problem_id: number;
  status: "accepted" | "suboptimal" | "wrong" | "timeout" | "error";
  execution_time_ms: number;
  feedback: SubmissionFeedback;
  score: number;
  submitted_at: string;
}

export interface SubmissionListItem {
  id: number;
  problem_id: number;
  problem_title: string;
  status: "accepted" | "suboptimal" | "wrong" | "timeout" | "error";
  score: number;
  submitted_at: string;
}

export interface SubmitSolutionRequest {
  code: string;
}

/**
 * Submit a solution for a problem
 */
export async function submitSolution(
  problemId: number,
  code: string
): Promise<Submission> {
  return apiFetch<Submission>(
    `/problems/${problemId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
    true
  );
}

/**
 * Get user's submission history
 */
export async function fetchSubmissions(
  limit = 50,
  offset = 0
): Promise<SubmissionListItem[]> {
  return apiFetch<SubmissionListItem[]>(
    `/submissions?limit=${limit}&offset=${offset}`,
    {},
    true
  );
}

/**
 * Get a specific submission by ID
 */
export async function fetchSubmissionById(id: number): Promise<Submission> {
  return apiFetch<Submission>(`/submissions/${id}`, {}, true);
}

/**
 * Get submissions for a specific problem
 */
export async function fetchProblemSubmissions(
  problemId: number,
  limit = 20
): Promise<Submission[]> {
  return apiFetch<Submission[]>(
    `/problems/${problemId}/submissions?limit=${limit}`,
    {},
    true
  );
}


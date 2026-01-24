import { supabase } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Get the current auth token from Supabase session
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * API error class for consistent error handling
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

/**
 * Generic fetch wrapper with auth handling
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  requireAuth = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add auth token if available or required
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (requireAuth) {
    throw new ApiError(401, "Authentication required");
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Try to parse error message
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();

      // Enhanced logging for validation errors
      if (response.status === 422) {
        console.error('Validation Error (422):', JSON.stringify(errorData, null, 2));
        if (errorData.detail) {
          errorMessage = Array.isArray(errorData.detail)
            ? errorData.detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join('\n')
            : errorData.detail;
        }
      } else {
        errorMessage = errorData.message || errorData.detail || 'An error occurred';
      }
    } catch (e) {
      // If response is not JSON
      errorMessage = response.statusText;
    }

    throw new Error(errorMessage);
  }

  // Handle empty responses (e.g., 204 No Content)
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {} as T;
  }

  return response.json();
}


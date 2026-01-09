import { apiFetch } from "./client";

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_premium: boolean;
  total_score: number;
  problems_solved: number;
  streak_days: number;
  created_at: string;
}

export interface UpdateProfileRequest {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}

/**
 * Get current user's profile
 */
export async function fetchUserProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me", {}, true);
}

/**
 * Update current user's profile
 */
export async function updateUserProfile(
  data: UpdateProfileRequest
): Promise<UserProfile> {
  return apiFetch<UserProfile>(
    "/users/me",
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    true
  );
}


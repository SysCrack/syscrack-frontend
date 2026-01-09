"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchUserProfile,
  updateUserProfile,
  type UpdateProfileRequest,
} from "@/lib/api/users";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook to fetch current user's profile
 */
export function useUser() {
  const session = useAuthStore((state) => state.session);

  return useQuery({
    queryKey: ["users", "me"],
    queryFn: fetchUserProfile,
    // Only fetch if user is authenticated
    enabled: !!session,
  });
}

/**
 * Hook to update user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileRequest) => updateUserProfile(data),
    onSuccess: () => {
      // Invalidate user profile cache
      queryClient.invalidateQueries({ queryKey: ["users", "me"] });
    },
  });
}


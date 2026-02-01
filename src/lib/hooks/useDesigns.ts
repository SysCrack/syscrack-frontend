/**
 * React Query hooks for Design API operations
 * 
 * Provides caching, background refetching, and optimistic updates
 * for design CRUD operations.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as designsApi from "@/lib/api/designs";
import type {
    DesignCreate,
    DesignUpdate,
    DesignOut,
    DesignDetailOut,
    ValidationResponse,
} from "@/lib/types/design";

// Query Keys
export const designKeys = {
    all: ["designs"] as const,
    lists: () => [...designKeys.all, "list"] as const,
    list: (problemId?: number) => [...designKeys.lists(), { problemId }] as const,
    details: () => [...designKeys.all, "detail"] as const,
    detail: (id: number) => [...designKeys.details(), id] as const,
    validation: (id: number) => [...designKeys.all, "validation", id] as const,
};

/**
 * Fetch a single design by ID
 */
export function useDesign(designId: number | null) {
    return useQuery({
        queryKey: designKeys.detail(designId ?? 0),
        queryFn: () => designsApi.getDesign(designId!),
        enabled: designId !== null,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch list of designs, optionally filtered by problem
 */
export function useDesigns(problemId?: number) {
    return useQuery({
        queryKey: designKeys.list(problemId),
        queryFn: () => designsApi.listDesigns(problemId),
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Create a new design
 */
export function useCreateDesign() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (design: DesignCreate) => designsApi.createDesign(design),
        onSuccess: (newDesign) => {
            // Invalidate lists to refetch
            queryClient.invalidateQueries({ queryKey: designKeys.lists() });
            // Add the new design to cache
            queryClient.setQueryData(
                designKeys.detail(newDesign.id),
                newDesign
            );
        },
    });
}

/**
 * Update an existing design
 */
export function useUpdateDesign() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            designId,
            design,
        }: {
            designId: number;
            design: DesignUpdate;
        }) => designsApi.updateDesign(designId, design),
        onSuccess: (updatedDesign, { designId }) => {
            // Update the design in cache
            queryClient.setQueryData(designKeys.detail(designId), updatedDesign);
            // Invalidate lists
            queryClient.invalidateQueries({ queryKey: designKeys.lists() });
        },
    });
}

/**
 * Delete a design
 */
export function useDeleteDesign() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (designId: number) => designsApi.deleteDesign(designId),
        onSuccess: (_, designId) => {
            // Remove from cache
            queryClient.removeQueries({ queryKey: designKeys.detail(designId) });
            // Invalidate lists
            queryClient.invalidateQueries({ queryKey: designKeys.lists() });
        },
    });
}

/**
 * Validate a saved design
 */
export function useValidateDesign(designId: number | null) {
    return useQuery({
        queryKey: designKeys.validation(designId ?? 0),
        queryFn: () => designsApi.validateSavedDesign(designId!),
        enabled: false, // Manual trigger only
    });
}

/**
 * Validate a design draft (mutation - not cached)
 */
export function useValidateDesignDraft() {
    return useMutation({
        mutationFn: (design: DesignCreate) => designsApi.validateDesignDraft(design),
    });
}

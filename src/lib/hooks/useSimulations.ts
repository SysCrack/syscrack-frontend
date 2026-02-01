/**
 * React Query hooks for Simulation API operations
 * 
 * Provides hooks for running simulations and fetching results.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import * as simulationsApi from "@/lib/api/simulations";
import type { SimulationRequest, SimulationResponse } from "@/lib/types/design";

// Query Keys
export const simulationKeys = {
    all: ["simulations"] as const,
    detail: (jobId: string) => [...simulationKeys.all, jobId] as const,
};

/**
 * Fetch simulation status/results by job ID
 */
export function useSimulationStatus(jobId: string | null, options?: { refetchInterval?: number }) {
    return useQuery({
        queryKey: simulationKeys.detail(jobId ?? ""),
        queryFn: () => simulationsApi.getSimulationStatus(jobId!),
        enabled: jobId !== null,
        refetchInterval: options?.refetchInterval, // For polling
    });
}

/**
 * Start a new simulation
 */
export function useRunSimulation() {
    return useMutation({
        mutationFn: ({
            designId,
            request,
        }: {
            designId: number;
            request?: SimulationRequest;
        }) => simulationsApi.runSimulation(designId, request),
    });
}

/**
 * Hook to poll simulation until complete
 * Returns the simulation response once complete or failed
 */
export function useSimulationPolling(
    jobId: string | null,
    onProgress?: (response: SimulationResponse) => void
) {
    return useQuery({
        queryKey: [...simulationKeys.detail(jobId ?? ""), "polling"],
        queryFn: async () => {
            if (!jobId) throw new Error("No job ID");
            return simulationsApi.pollSimulationUntilComplete(jobId, onProgress);
        },
        enabled: jobId !== null,
        staleTime: Infinity, // Don't refetch automatically
        retry: false, // Don't retry on error
    });
}

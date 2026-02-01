/**
 * API client for Simulation endpoints
 */
import { apiFetch } from './client';
import type {
    SimulationRequest,
    SimulationResponse,
} from '@/lib/types/design';

/**
 * Start a simulation for a design
 */
export async function runSimulation(
    designId: number,
    request: SimulationRequest = {}
): Promise<{ job_id: string; status: string; estimated_time_sec: number }> {
    return apiFetch(`/simulations/designs/${designId}/run`, {
        method: 'POST',
        body: JSON.stringify(request),
    }, true);
}

/**
 * Get simulation status and results
 */
export async function getSimulationStatus(
    jobId: string
): Promise<SimulationResponse> {
    return apiFetch<SimulationResponse>(`/simulations/${jobId}`, {
        method: 'GET',
    }, true);
}

/**
 * Poll for simulation completion
 * @param jobId - The simulation job ID
 * @param onProgress - Callback for progress updates
 * @param pollIntervalMs - How often to poll (default 1000ms)
 * @param maxAttempts - Maximum poll attempts (default 120 = 2 minutes)
 */
export async function pollSimulationUntilComplete(
    jobId: string,
    onProgress?: (response: SimulationResponse) => void,
    pollIntervalMs = 1000,
    maxAttempts = 120
): Promise<SimulationResponse> {
    let attempts = 0;

    while (attempts < maxAttempts) {
        const response = await getSimulationStatus(jobId);

        if (onProgress) {
            onProgress(response);
        }

        if (response.status === 'completed' || response.status === 'failed') {
            return response;
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        attempts++;
    }

    throw new Error('Simulation polling timed out');
}

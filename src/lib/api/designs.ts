/**
 * API client for System Design endpoints
 */
import { apiFetch } from './client';
import type {
    DesignCreate,
    DesignUpdate,
    DesignOut,
    DesignDetailOut,
    ValidationResponse,
    ConceptGradingResponse,
} from '@/lib/types/design';

const BASE_PATH = '/designs';

/**
 * Create a new system design
 */
export async function createDesign(design: DesignCreate): Promise<DesignDetailOut> {
    return apiFetch<DesignDetailOut>(BASE_PATH, {
        method: 'POST',
        body: JSON.stringify(design),
    }, true);
}

/**
 * Get a specific design by ID
 */
export async function getDesign(designId: number): Promise<DesignDetailOut> {
    return apiFetch<DesignDetailOut>(`${BASE_PATH}/${designId}`, {
        method: 'GET',
    }, true);
}

/**
 * Update an existing design
 */
export async function updateDesign(
    designId: number,
    design: DesignUpdate
): Promise<DesignDetailOut> {
    return apiFetch<DesignDetailOut>(`${BASE_PATH}/${designId}`, {
        method: 'PUT',
        body: JSON.stringify(design),
    }, true);
}

/**
 * Delete a design
 */
export async function deleteDesign(designId: number): Promise<void> {
    await apiFetch<void>(`${BASE_PATH}/${designId}`, {
        method: 'DELETE',
    }, true);
}

/**
 * List user's designs, optionally filtered by problem
 */
export async function listDesigns(problemId?: number): Promise<DesignOut[]> {
    const params = problemId ? `?problem_id=${problemId}` : '';
    return apiFetch<DesignOut[]>(`${BASE_PATH}${params}`, {
        method: 'GET',
    }, true);
}

/**
 * Validate a design draft without saving
 */
export async function validateDesignDraft(
    design: DesignCreate
): Promise<ValidationResponse> {
    return apiFetch<ValidationResponse>(`${BASE_PATH}/validate`, {
        method: 'POST',
        body: JSON.stringify(design),
    }, false); // Validation doesn't require auth
}

/**
 * Validate an existing saved design
 */
export async function validateSavedDesign(
    designId: number
): Promise<ValidationResponse> {
    return apiFetch<ValidationResponse>(`${BASE_PATH}/${designId}/validate`, {
        method: 'POST',
    }, true);
}

/**
 * Run concept-based grading on a design
 * Returns detailed feedback on architecture choices
 */
export async function gradeDesign(
    designId: number
): Promise<ConceptGradingResponse> {
    return apiFetch<ConceptGradingResponse>(`${BASE_PATH}/${designId}/grade`, {
        method: 'POST',
    }, true);
}

/**
 * Run discrete request trace for step-by-step visualization
 * Returns detailed trace of each request including hops and timing
 */
export async function runDebugTrace(
    designId: number,
    numRequests: number = 100
): Promise<DebugTraceResponse> {
    return apiFetch<DebugTraceResponse>(
        `${BASE_PATH}/${designId}/debug-trace?num_requests=${numRequests}`,
        { method: 'POST' },
        true
    );
}

// Type definition for debug trace response
export interface DebugTraceResponse {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    cached_requests: number;
    avg_hops: number;
    avg_latency_ms: number;
    p99_latency_ms: number;
    traces: Array<{
        request_id: string;
        start_time_ms: number;
        end_time_ms: number;
        total_latency_ms: number;
        status: string;
        hops: Array<{
            component_id: string;
            component_name: string;
            component_type: string;
            arrival_time_ms: number;
            processing_time_ms: number;
            departure_time_ms: number;
            status: string;
            cache_hit: boolean;
            error_message: string | null;
        }>;
    }>;
}

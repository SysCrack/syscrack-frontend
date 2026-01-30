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


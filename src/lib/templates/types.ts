export const TEMPLATE_SCHEMA_VERSION = 1;

export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type TemplateCategory = 'classic' | 'real-world' | 'ddia';
export type ScoringCheckType = 'topology' | 'config';
export type ScoringWeight = 'required' | 'bonus';

export interface ScoringCriteria {
    id: string;
    description: string;
    checkType: ScoringCheckType;
    weight: ScoringWeight;
    params: Record<string, unknown>; // scoringEngine.ts interprets these
}

// ── Workload Archetypes ──

export interface SampleDataEntry {
    id: string;
    preview: string;       // e.g. 'https://github.com/...' or '@alice: just shipped...'
}

export interface RequestArchetype {
    id: string;              // 'redirect-lookup'
    label: string;           // 'Redirect lookup'
    method: 'read' | 'write';
    weight: number;          // relative freq, all weights summed → 100%
    cacheKeyPattern?: string;// 'redirect:{id}' — only if this request touches cache
    sampleIds: string[];     // cycled randomly at spawn time
    sampleData?: SampleDataEntry[];
    dbLabel?: string;        // shown in DB inspector, e.g. 'SELECT url FROM urls WHERE code = ?'
    mqLabel?: string;        // shown in MQ/trace when this request enqueues
}

export interface WorkloadProfile {
    archetypes: RequestArchetype[];
    readLabel: string;       // e.g. 'Redirects'  (replaces generic 'Reads')
    writeLabel: string;      // e.g. 'Shortens'   (replaces generic 'Writes')
}

// ── Scenario Template ──

export interface ScenarioTemplate {
    schemaVersion: number;
    id: string;                // kebab-case e.g. 'url-shortener'
    name: string;
    difficulty: TemplateDifficulty;
    category: TemplateCategory;
    description: string;       // 1-2 sentences for picker card
    designRationale: string;   // shown in banner after load
    tags: string[];
    nodes: import('../types/canvas').CanvasNode[];
    connections: import('../types/canvas').CanvasConnection[];
    scoringRubric: ScoringCriteria[];
    workloadRef: string;       // stub — used by Cloud phase e.g. 'url-shortener-v1'
    workloadProfile?: WorkloadProfile; // when set, overrides client readWriteRatio
}

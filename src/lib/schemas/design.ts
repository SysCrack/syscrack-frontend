/**
 * Schema definitions for saved designs and deployment-ready topology.
 * Used for save/share and for Cloud deployment export.
 */
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';

// ── Template + Archetype types ───────────────────────────────────────────────

export type TemplateType = 'url-shortener' | 'ecommerce' | 'twitter-feed' | null;

export type WorkloadArchetype =
  | 'browse-heavy'
  | 'write-heavy'
  | 'balanced'
  | 'spike'
  | null;

// ── Full canvas state — used for save/share ──────────────────────────────────

export interface SavedDesign {
  id: string;
  version: '1.0';
  template: TemplateType;
  archetype: WorkloadArchetype;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: {
    x: number;
    y: number;
    scale: number;
  };
  metadata: {
    name: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    isPublic: boolean;
    shareToken: string | null;
  };
}

// ── Deployment topology — sent to Go backend on Deploy ───────────────────────
// Derived from SavedDesign. No positions, no viewport. Template is required.

export interface DeploymentNode {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

export interface DeploymentConnection {
  sourceId: string;
  targetId: string;
  protocol: string;
}

export interface DeploymentDesign {
  version: '1.0';
  template: Exclude<TemplateType, null>;
  archetype: Exclude<WorkloadArchetype, null>;
  nodes: DeploymentNode[];
  connections: DeploymentConnection[];
}

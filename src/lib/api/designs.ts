'use client';

import { supabase } from '@/lib/supabase/client';
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import type { SavedDesign, TemplateType, WorkloadArchetype } from '@/lib/schemas/design';
import type { DesignCreate, DesignUpdate, DesignOut, DesignDetailOut, ValidationResponse } from '@/lib/types/design';
import { nanoid } from 'nanoid';

export async function saveDesign(params: {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: { x: number; y: number; scale: number };
  template: TemplateType;
  archetype: WorkloadArchetype;
  name: string;
  existingId?: string;
}): Promise<{ id: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('You must be signed in to save a design');
  }

  const now = new Date().toISOString();
  const isUpdate = !!params.existingId;

  let existingShareToken: string | null = null;
  let existingIsPublic = false;
  let createdAt = now;

  if (isUpdate) {
    const { data: existing, error: fetchError } = await supabase
      .from('saved_designs')
      .select('share_token, is_public, created_at')
      .eq('id', params.existingId)
      .eq('user_id', user.id)
      .single();
    if (fetchError || !existing) {
      throw new Error('Design not found or you do not have permission to update it');
    }
    existingShareToken = existing.share_token;
    existingIsPublic = existing.is_public;
    createdAt = existing.created_at;
  }

  const designId = isUpdate ? params.existingId! : crypto.randomUUID();
  const savedDesign: SavedDesign = {
    id: designId,
    version: '1.0',
    template: params.template,
    archetype: params.archetype,
    nodes: params.nodes,
    connections: params.connections,
    viewport: params.viewport,
    metadata: {
      name: params.name,
      createdAt,
      updatedAt: now,
      userId: user.id,
      isPublic: existingIsPublic,
      shareToken: existingShareToken,
    },
  };

  const row = {
    id: designId,
    user_id: user.id,
    name: params.name,
    template: params.template,
    archetype: params.archetype,
    canvas_state: savedDesign as unknown as Record<string, unknown>,
    is_public: existingIsPublic,
    share_token: existingShareToken,
    updated_at: now,
  };

  if (isUpdate) {
    const { error: updateError } = await supabase
      .from('saved_designs')
      .update({
        name: params.name,
        template: params.template,
        archetype: params.archetype,
        canvas_state: row.canvas_state,
        updated_at: now,
      })
      .eq('id', params.existingId)
      .eq('user_id', user.id);
    if (updateError) {
      throw new Error(updateError.message || 'Failed to update design');
    }
  } else {
    const { error: insertError } = await supabase.from('saved_designs').insert({
      ...row,
      created_at: now,
    });
    if (insertError) {
      throw new Error(insertError.message || 'Failed to save design');
    }
  }

  return { id: designId };
}

export async function shareDesign(designId: string): Promise<{ shareUrl: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('You must be signed in to share a design');
  }

  const { data: row, error: fetchError } = await supabase
    .from('saved_designs')
    .select('share_token')
    .eq('id', designId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !row) {
    throw new Error('Design not found or you do not have permission to share it');
  }

  let token = row.share_token;
  if (!token) {
    token = nanoid(10);
    const { error: updateError } = await supabase
      .from('saved_designs')
      .update({ is_public: true, share_token: token, updated_at: new Date().toISOString() })
      .eq('id', designId)
      .eq('user_id', user.id);
    if (updateError) {
      throw new Error(updateError.message || 'Failed to generate share link');
    }
  } else {
    const { error: updateError } = await supabase
      .from('saved_designs')
      .update({ is_public: true, updated_at: new Date().toISOString() })
      .eq('id', designId)
      .eq('user_id', user.id);
    if (updateError) {
      throw new Error(updateError.message || 'Failed to update share status');
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = `${origin}/design/share/${token}`;
  return { shareUrl };
}

export async function loadSharedDesign(shareToken: string): Promise<SavedDesign> {
  const { data: row, error } = await supabase
    .from('saved_designs')
    .select('canvas_state')
    .eq('share_token', shareToken)
    .eq('is_public', true)
    .single();

  if (error || !row) {
    throw new Error('Design not found or no longer public');
  }

  const design = row.canvas_state as unknown as SavedDesign;
  if (!design || !design.nodes || !design.connections) {
    throw new Error('Invalid design data');
  }
  return design;
}

export async function listMyDesigns(): Promise<
  Array<{
    id: string;
    name: string;
    template: TemplateType;
    archetype: WorkloadArchetype;
    updatedAt: string;
    isPublic: boolean;
    shareToken: string | null;
  }>
> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('You must be signed in to list your designs');
  }

  const { data: rows, error } = await supabase
    .from('saved_designs')
    .select('id, name, template, archetype, updated_at, is_public, share_token')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load designs');
  }

  return (rows || []).map((r: {
    id: string;
    name: string;
    template: TemplateType | null;
    archetype: WorkloadArchetype | null;
    updated_at: string;
    is_public: boolean;
    share_token: string | null;
  }) => ({
    id: r.id,
    name: r.name,
    template: r.template as TemplateType,
    archetype: r.archetype as WorkloadArchetype,
    updatedAt: r.updated_at,
    isPublic: r.is_public,
    shareToken: r.share_token,
  }));
}

/** Load a single design by id (current user only). Used when opening from My Designs. */
export async function getDesignById(designId: string): Promise<SavedDesign> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('You must be signed in to load a design');
  }

  const { data: row, error } = await supabase
    .from('saved_designs')
    .select('canvas_state')
    .eq('id', designId)
    .eq('user_id', user.id)
    .single();

  if (error || !row) {
    throw new Error('Design not found');
  }

  const design = row.canvas_state as unknown as SavedDesign;
  if (!design || !design.nodes || !design.connections) {
    throw new Error('Invalid design data');
  }
  return design;
}

export async function forkDesign(designId: string, name: string): Promise<{ id: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('You must be signed in to fork a design');
  }

  const { data: row, error: fetchError } = await supabase
    .from('saved_designs')
    .select('id, user_id, is_public, canvas_state')
    .eq('id', designId)
    .single();

  if (fetchError || !row) {
    throw new Error('Design not found or no longer available');
  }

  const isOwner = row.user_id === user.id;
  const isPublic = row.is_public === true;
  if (!isOwner && !isPublic) {
    throw new Error('You can only fork your own designs or public shared designs');
  }

  const design = row.canvas_state as unknown as SavedDesign;
  if (!design || !design.nodes || !design.connections) {
    throw new Error('Invalid design data');
  }

  const now = new Date().toISOString();
  const newId = crypto.randomUUID();
  const forkedDesign: SavedDesign = {
    ...design,
    id: newId,
    metadata: {
      ...design.metadata,
      name,
      createdAt: now,
      updatedAt: now,
      userId: user.id,
      isPublic: false,
      shareToken: null,
    },
  };

  const { error: insertError } = await supabase.from('saved_designs').insert({
    id: newId,
    user_id: user.id,
    name,
    template: design.template,
    archetype: design.archetype,
    canvas_state: forkedDesign as unknown as Record<string, unknown>,
    is_public: false,
    share_token: null,
    created_at: now,
    updated_at: now,
  });

  if (insertError) {
    throw new Error(insertError.message || 'Failed to fork design');
  }

  return { id: newId };
}

// ── Compatibility exports for problem-based design flow (Excalidraw / design/[problemId]) ──
// These stubs satisfy imports from SystemDesignCanvas, RunSimulationButton, useDesigns.
// The problem flow expects a different backend (numeric ids, problem_id). Use Sandbox for save/share.

export async function createDesign(_payload: DesignCreate): Promise<DesignOut & { id: number }> {
  throw new Error('Design API (problem flow) is not available. Use the Sandbox to create and save designs.');
}

export async function getDesign(_designId: number): Promise<DesignDetailOut> {
  throw new Error('Design API (problem flow) is not available. Use the Sandbox to load designs.');
}

export async function listDesigns(_problemId?: number): Promise<DesignOut[]> {
  return [];
}

export async function updateDesign(_designId: number, _payload: DesignUpdate): Promise<DesignOut> {
  throw new Error('Design API (problem flow) is not available. Use the Sandbox to update designs.');
}

export async function deleteDesign(_designId: number): Promise<void> {
  throw new Error('Design API (problem flow) is not available. Use the Sandbox to manage designs.');
}

export async function validateSavedDesign(_designId: number): Promise<ValidationResponse> {
  return { valid: true, errors: [], warnings: [] };
}

export async function validateDesignDraft(_design: DesignCreate): Promise<ValidationResponse> {
  return { valid: true, errors: [], warnings: [] };
}

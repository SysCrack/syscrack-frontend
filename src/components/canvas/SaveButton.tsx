'use client';

import { useState, useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { saveDesign } from '@/lib/api/designs';
import type { TemplateType, WorkloadArchetype } from '@/lib/schemas/design';

const DEFAULT_ARCHETYPE: WorkloadArchetype = 'balanced';

export interface SaveButtonProps {
  designId: string | null;
  designName: string;
  onSaved: (id: string) => void;
  onNameChange?: (name: string) => void;
  className?: string;
}

export function SaveButton({
  designId,
  designName,
  onSaved,
  onNameChange,
  className = '',
}: SaveButtonProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);
  const viewport = useCanvasStore((s) => s.viewport);
  const activeTemplateId = useCanvasStore((s) => s.activeTemplateId);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(designName || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const template: TemplateType =
    activeTemplateId === 'url-shortener'
      ? 'url-shortener'
      : activeTemplateId === 'ecommerce'
        ? 'ecommerce'
        : activeTemplateId === 'twitter-feed'
          ? 'twitter-feed'
          : null;

  const handleSave = useCallback(
    async (name: string) => {
      if (saving) return;
      const finalName =
        name?.trim() || (template ? `${template} Design` : 'My Design');
      setSaving(true);
      try {
        const { id } = await saveDesign({
          nodes,
          connections,
          viewport: { x: viewport.x, y: viewport.y, scale: viewport.scale },
          template,
          archetype: DEFAULT_ARCHETYPE,
          name: finalName,
          existingId: designId || undefined,
        });
        onSaved(id);
        onNameChange?.(finalName);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Failed to save design');
      } finally {
        setSaving(false);
        setIsEditingName(false);
      }
    },
    [
      saving,
      nodes,
      connections,
      viewport,
      template,
      designId,
      onSaved,
      onNameChange,
    ],
  );

  const handleFirstSave = () => {
    if (designId) {
      handleSave(designName || nameInput);
      return;
    }
    setNameInput(designName || (template ? `${template} Design` : 'My Design'));
    setIsEditingName(true);
  };

  const handleConfirmName = () => {
    handleSave(nameInput);
  };

  return (
    <div className={className} style={{ position: 'relative' }}>
      {isEditingName ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#181e2e',
            border: '1px solid #2a3244',
            borderRadius: 8,
            padding: '4px 8px',
          }}
        >
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmName();
              if (e.key === 'Escape') setIsEditingName(false);
            }}
            placeholder="Design name"
            autoFocus
            style={{
              width: 160,
              padding: '4px 8px',
              fontSize: 12,
              background: '#121826',
              border: '1px solid #2a3244',
              borderRadius: 6,
              color: '#e2e8f0',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleConfirmName}
            disabled={saving}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#e2e8f0',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsEditingName(false)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              color: '#94a3b8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleFirstSave}
          disabled={saving}
          title={designId ? 'Save changes' : 'Save design'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: saved ? '#22c55e' : '#e2e8f0',
            background: saved ? 'rgba(34, 197, 94, 0.15)' : 'rgba(30, 41, 59, 0.9)',
            border: `1px solid ${saved ? 'rgba(34, 197, 94, 0.4)' : '#2a3244'}`,
            borderRadius: 8,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? (
            <>Saving...</>
          ) : saved ? (
            <>Saved ✓</>
          ) : (
            <>Save</>
          )}
        </button>
      )}
    </div>
  );
}

export default SaveButton;

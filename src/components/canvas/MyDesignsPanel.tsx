'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { listMyDesigns, getDesignById } from '@/lib/api/designs';
import type { TemplateType } from '@/lib/schemas/design';

export interface MyDesignsPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectDesign: (id: string, name: string, shareToken: string | null) => void;
  className?: string;
}

interface DesignRow {
  id: string;
  name: string;
  template: TemplateType;
  updatedAt: string;
  isPublic: boolean;
  shareToken: string | null;
}

export function MyDesignsPanel({
  open,
  onClose,
  onSelectDesign,
  className = '',
}: MyDesignsPanelProps) {
  const [list, setList] = useState<DesignRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDesignFull = useCanvasStore((s) => s.loadDesignFull);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listMyDesigns();
      setList(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load designs');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  const handleSelect = useCallback(
    async (id: string, name: string, shareToken: string | null) => {
      const store = useCanvasStore.getState();
      if (store.hasUnsavedWork?.() && !window.confirm('Replace current canvas? Unsaved changes will be lost.')) {
        return;
      }
      try {
        const design = await getDesignById(id);
        loadDesignFull(
          design.nodes,
          design.connections,
          design.viewport,
          design.template,
        );
        onSelectDesign(id, design.metadata.name, design.metadata.shareToken);
        onClose();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to load design');
      }
    },
    [loadDesignFull, onSelectDesign, onClose],
  );

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const templateLabel = (t: TemplateType) => (t ? t.replace(/-/g, ' ') : '—');

  if (!open) return null;

  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#181e2e',
          border: '1px solid #2a3244',
          borderRadius: 12,
          maxWidth: 480,
          width: '100%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #2a3244',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>
            My Designs
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 18,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: 24, color: '#f87171', fontSize: 14 }}>
              {error}
            </div>
          )}
          {!loading && !error && list.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
              No saved designs yet. Save from the canvas to see them here.
            </div>
          )}
          {!loading && !error && list.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => handleSelect(row.id, row.name, row.shareToken)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    background: '#121826',
                    border: '1px solid #2a3244',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#e2e8f0',
                    fontSize: 14,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {templateLabel(row.template)} · {formatDate(row.updatedAt)}
                    </div>
                  </div>
                  {row.isPublic && (
                    <span style={{ fontSize: 12, color: '#22c55e' }} title="Shared">
                      🔗
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyDesignsPanel;

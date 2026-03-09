'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCanvasStore } from '@/stores/canvasStore';
import { loadSharedDesign, forkDesign } from '@/lib/api/designs';
import { supabase } from '@/lib/supabase/client';
import { TopNav } from '@/components/layout/TopNav';

type AuthUserResponse = { data?: { user?: { id: string } | null }; error?: unknown };

const SystemCanvas = dynamic(
  () => import('@/components/system-canvas/SystemCanvas'),
  { ssr: false },
);

export default function SharedDesignPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params?.token === 'string' ? params.token : null;

  const [status, setStatus] = useState<'loading' | 'found' | 'error'>('loading');
  const [designId, setDesignId] = useState<string | null>(null);
  const [designName, setDesignName] = useState('');
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [forking, setForking] = useState(false);
  const [forkName, setForkName] = useState('');

  const loadDesignFull = useCanvasStore((s) => s.loadDesignFull);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    loadSharedDesign(token)
      .then((design) => {
        if (cancelled) return;
        loadDesignFull(
          design.nodes,
          design.connections,
          design.viewport,
          design.template,
        );
        setDesignId(design.id);
        setDesignName(design.metadata.name);
        setStatus('found');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [token, loadDesignFull]);

  useEffect(() => {
    supabase.auth.getUser().then((res: AuthUserResponse) => {
      const u = res.data?.user;
      setUser(u ? { id: u.id } : null);
    });
  }, []);

  const handleFork = async () => {
    if (!designId || forking) return;
    if (!user) {
      router.push('/auth?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    const name = forkName.trim() || `${designName} (fork)`;
    setForking(true);
    try {
      const { id } = await forkDesign(designId, name);
      router.push(`/sandbox?designId=${id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fork');
    } finally {
      setForking(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex items-center justify-center text-[#94a3b8]">
          Loading shared design…
        </main>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 text-[#e2e8f0]">
          <p className="text-lg">Design not found or no longer public.</p>
          <Link
            href="/sandbox"
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90"
          >
            Open Sandbox
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--color-canvas-bg)]">
      <TopNav />
      <div
        style={{
          flex: '0 0 auto',
          padding: '10px 16px',
          background: 'rgba(30, 41, 59, 0.95)',
          borderBottom: '1px solid #2a3244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, color: '#94a3b8' }}>
          This is a shared design — Fork to edit
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            placeholder="Fork name (optional)"
            style={{
              width: 180,
              padding: '6px 10px',
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
            onClick={handleFork}
            disabled={forking}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: '#e2e8f0',
              background: user ? '#3b82f6' : '#475569',
              border: 'none',
              borderRadius: 8,
              cursor: user && !forking ? 'pointer' : 'not-allowed',
            }}
          >
            {!user ? 'Sign in to fork' : forking ? 'Forking…' : 'Fork'}
          </button>
        </div>
      </div>
      <main className="flex-1 min-h-0">
        <SystemCanvas readOnly />
      </main>
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { shareDesign } from '@/lib/api/designs';

export interface ShareButtonProps {
  designId: string | null;
  shareUrl: string | null;
  onShareUrl: (url: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ShareButton({
  designId,
  shareUrl,
  onShareUrl,
  disabled = false,
  className = '',
}: ShareButtonProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCopy, setShowCopy] = useState(false);

  const handleShare = useCallback(async () => {
    if (!designId) {
      alert('Save the design first to get a share link.');
      return;
    }
    if (shareUrl) {
      setShowCopy(true);
      return;
    }
    setLoading(true);
    try {
      const { shareUrl: url } = await shareDesign(designId);
      onShareUrl(url);
      setShowCopy(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to generate share link');
    } finally {
      setLoading(false);
    }
  }, [designId, shareUrl, onShareUrl]);

  const handleCopy = useCallback(() => {
    const url = shareUrl || '';
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => alert('Could not copy to clipboard'),
    );
  }, [shareUrl]);

  const currentUrl = shareUrl || '';

  return (
    <div className={className}>
      {showCopy && currentUrl ? (
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
            readOnly
            value={currentUrl}
            style={{
              width: 260,
              padding: '4px 8px',
              fontSize: 11,
              background: '#121826',
              border: '1px solid #2a3244',
              borderRadius: 6,
              color: '#94a3b8',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#e2e8f0',
              background: copied ? '#22c55e' : '#3b82f6',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => setShowCopy(false)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              color: '#94a3b8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleShare}
          disabled={disabled || !designId || loading}
          title={designId ? 'Get share link' : 'Save design first to share'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#e2e8f0',
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid #2a3244',
            borderRadius: 8,
            cursor: disabled || !designId || loading ? 'not-allowed' : 'pointer',
            opacity: disabled || !designId ? 0.7 : 1,
          }}
        >
          {loading ? 'Generating…' : 'Share'}
        </button>
      )}
    </div>
  );
}

export default ShareButton;

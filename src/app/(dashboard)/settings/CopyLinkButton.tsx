'use client';

import React, { useState, useEffect } from 'react';

export function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}/book/${slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  if (!origin) return null; // Avoid hydration mismatch on server

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px', background: 'var(--q-color-ink-50)', padding: '12px', borderRadius: '8px' }}>
      <div style={{ flex: 1, fontFamily: 'var(--q-font-mono)', fontSize: '0.85rem', color: 'var(--q-color-ink-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {url}
      </div>
      <button 
        onClick={handleCopy}
        className="q-btn q-btn-secondary q-btn-sm" 
        style={{ flexShrink: 0 }}
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}

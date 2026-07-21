'use client';
import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        readOnly
        value={fullUrl}
        style={{ flex: 1, padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', backgroundColor: 'var(--q-color-ink-50)', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--q-color-ink-700)' }}
      />
      <button type="button" className="q-btn q-btn-secondary" onClick={handleCopy} style={{ flexShrink: 0, padding: '9px 14px' }}>
        {copied ? <Check size={16} color="#059669" /> : <Copy size={16} />}
      </button>
      <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="q-btn q-btn-secondary" style={{ flexShrink: 0, padding: '9px 14px', display: 'flex', alignItems: 'center' }}>
        <ExternalLink size={16} />
      </a>
    </div>
  );
}

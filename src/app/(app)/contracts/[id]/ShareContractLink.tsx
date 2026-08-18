'use client';

import React, { useEffect, useState } from 'react';

/**
 * The one thing a contract needs that nothing else provides: a link a client
 * can actually open to read and sign it. Without this, activating a contract
 * from the dashboard has no way to reach the client at all.
 */
export function ShareContractLink({ orgSlug, contractId }: { orgSlug: string; contractId: string }) {
  const [copied, setCopied] = useState(false);
  // Start with the relative path so server and first client render match —
  // branching on `typeof window` here causes a hydration mismatch. Swap in
  // the full origin after mount instead.
  const [url, setUrl] = useState(`/portal/${orgSlug}/contract/${contractId}`);
  useEffect(() => {
    setUrl(`${window.location.origin}/portal/${orgSlug}/contract/${contractId}`);
  }, [orgSlug, contractId]);

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="q-row">
      <input readOnly value={url} className="q-input" style={{ flex: 1, minWidth: '14rem', fontFamily: 'var(--q-font-mono)', fontSize: '0.75rem' }} />
      <button className="q-btn q-btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="q-btn q-btn-secondary">View</a>
    </div>
  );
}

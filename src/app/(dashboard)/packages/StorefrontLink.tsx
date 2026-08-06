'use client';

import React, { useEffect, useState } from 'react';

/** Your public catalogue — the one link a studio hands out to let a prospect pick from everything they sell. */
export function StorefrontLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  // Relative first so server/client render match, then upgrade to the full
  // origin after mount — avoids a hydration mismatch (see ShareContractLink).
  const [url, setUrl] = useState(`/book/${slug}`);
  useEffect(() => {
    setUrl(`${window.location.origin}/book/${slug}`);
  }, [slug]);

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="q-row">
      <input readOnly value={url} className="q-input" style={{ minWidth: '14rem', fontFamily: 'var(--q-font-mono)', fontSize: '0.75rem' }} />
      <button className="q-btn q-btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="q-btn q-btn-secondary">View</a>
    </div>
  );
}

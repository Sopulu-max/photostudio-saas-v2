'use client';

import React, { useEffect, useState } from 'react';

/**
 * A public link a studio hands out, ready to copy or open.
 *
 * Three of them now, and the differences matter to whoever is being sent one:
 * the whole catalogue (/book/[slug]) for a prospect who should browse, the open
 * enquiry (/book/[slug]/custom) for one who wants something not on the shelf,
 * and ONE package (/book/[slug]/[id]) for a client who has already agreed what
 * they are booking and only needs to do it.
 *
 * Named for the first because it came first. It takes a path precisely so the
 * other two need no second component — the copy box, the origin fix-up and the
 * open-in-a-tab behaviour are the same job whatever is being linked to.
 */
export function StorefrontLink({ slug, path }: { slug: string, path?: string }) {
  const [copied, setCopied] = useState(false);
  
  const targetPath = path || `/book/${slug}`;
  
  // Relative first so server/client render match, then upgrade to the full
  // origin after mount — avoids a hydration mismatch (see ShareContractLink).
  const [url, setUrl] = useState(targetPath);
  useEffect(() => {
    setUrl(`${window.location.origin}${targetPath}`);
  }, [targetPath]);

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

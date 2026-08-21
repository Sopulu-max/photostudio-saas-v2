'use client';

import { useEffect, useState } from 'react';

/**
 * Compact copy control for a row. Starts on the relative path so the server and
 * the first client render agree, then swaps in the origin after mount.
 */
export function CopyGalleryLink({ token }: { token: string }) {
  const [url, setUrl] = useState(`/gallery/${token}`);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/gallery/${token}`);
  }, [token]);

  return (
    <button
      type="button"
      className="q-btn q-btn-secondary q-btn-sm"
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

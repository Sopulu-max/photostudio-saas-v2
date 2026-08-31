'use client';

import React, { useState } from 'react';
import { toast, readableError } from '@/components/Toast';

/**
 * Fetches the real PDF and hands it to the browser as a file.
 *
 * A plain link would do it, but the file is rendered on demand and can take a
 * few seconds — a link that appears to do nothing for four seconds reads as
 * broken, so this says what it's doing and reports failure rather than
 * navigating away to an error page.
 */
export function DownloadDocumentButton({
  href,
  filename,
  label = 'Download PDF',
  primary = true,
}: {
  href: string;
  filename: string;
  label?: string;
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not build that PDF.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className={`q-btn ${primary ? 'q-btn-primary' : 'q-btn-secondary'} q-noprint`}
      onClick={download}
      disabled={busy}
    >
      {busy ? 'Building…' : label}
    </button>
  );
}

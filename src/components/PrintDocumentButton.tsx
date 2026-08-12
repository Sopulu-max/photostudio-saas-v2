'use client';

import React from 'react';

/**
 * Hands the document to the browser's print dialog, where "Save as PDF" gives
 * a real file the studio can attach to a message.
 *
 * Deliberately not a server-side PDF renderer. That would mean a second
 * definition of the invoice's layout and a heavyweight dependency, and the two
 * layouts would drift. The cost is honest: this is a print dialog rather than
 * a one-click download, and on mobile it's Share → Print → Save to Files.
 */
export function PrintDocumentButton({
  label = 'Download / print',
  primary = false,
}: {
  label?: string;
  primary?: boolean;
}) {
  return (
    <button
      className={`q-btn ${primary ? 'q-btn-primary' : 'q-btn-secondary'} q-noprint`}
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}

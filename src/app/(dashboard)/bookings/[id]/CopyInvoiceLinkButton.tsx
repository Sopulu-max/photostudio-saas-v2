'use client';

import React, { useState } from 'react';

export function CopyInvoiceLinkButton({ orgSlug, txId }: { orgSlug: string, txId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}/portal/${orgSlug}/payment/${txId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      onClick={handleCopy} 
      className="q-btn q-btn-secondary q-btn-sm"
    >
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}

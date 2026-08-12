'use client';

import React, { useState } from 'react';

/**
 * Getting the document to the client.
 *
 * The studio sends it from their own account rather than the app sending mail
 * on their behalf — it lands in the thread the client already talks to them in,
 * it carries the studio's own name, and it needs no provider, no verified
 * domain and no deliverability problem to debug. The link is the same one the
 * client can download the PDF from.
 */
export function SendInvoice({
  sharePath,
  clientName,
  clientEmail,
  studioName,
  number,
  amountLabel,
  paidInFull,
}: {
  sharePath: string;
  clientName: string | null;
  clientEmail: string | null;
  studioName: string;
  number: string;
  amountLabel: string;
  paidInFull: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Resolved here because only the browser knows what host it's on.
  const shareUrl = typeof window === 'undefined' ? sharePath : `${window.location.origin}${sharePath}`;

  const greeting = clientName ? `Hi ${clientName.split(' ')[0]},` : 'Hi,';
  const body = paidInFull
    ? `${greeting}\n\nHere's your receipt (${number}) from ${studioName} — ${amountLabel}, paid in full. Thank you.\n\n${shareUrl}`
    : `${greeting}\n\nHere's your invoice (${number}) from ${studioName} for ${amountLabel}.\n\n${shareUrl}`;
  const subject = paidInFull ? `Receipt ${number} from ${studioName}` : `Invoice ${number} from ${studioName}`;

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(body)}`;
  const mailto = `mailto:${clientEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (!open) {
    return (
      <button className="q-btn q-btn-primary q-noprint" onClick={() => setOpen(true)}>
        Send to client
      </button>
    );
  }

  return (
    <div className="q-note q-stack q-stack-sm q-noprint">
      <span className="q-meta-sm">
        Sent from you, not from the app — so it arrives where {clientName || 'your client'} already talks to you.
      </span>
      <div className="q-row">
        <a className="q-btn q-btn-secondary q-btn-sm" href={whatsapp} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a className="q-btn q-btn-secondary q-btn-sm" href={mailto}>
          Email{clientEmail ? '' : ' (no address on file)'}
        </a>
        <button
          className="q-btn q-btn-secondary q-btn-sm"
          onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>
    </div>
  );
}

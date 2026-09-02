'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shareBooking, unshareBooking } from '@/modules/bookings/interface';
import { CopyLinkButton } from '@/components/CopyLinkButton';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toast, readableError } from '@/components/Toast';

/**
 * The client's own copy of their booking, opened and closed by the studio.
 *
 * A capability link: whoever holds it can read, and nobody signs in. That is
 * the same bargain the gallery, the invoice and the receipt already strike,
 * and it is the right one — a client should not need an account to find out
 * when their own shoot is.
 *
 * SHARING TWICE HANDS BACK THE SAME LINK. Pressing Share again is asking to
 * send it, not to replace it, and minting a fresh token would silently kill
 * one the client may already have in a message. Replacing it is what revoking
 * is for, and revoking says out loud what it does.
 */
export function ShareBooking({
  bookingId,
  shareToken,
  sharedAt,
  hasClient,
}: {
  bookingId: string;
  shareToken: string | null;
  sharedAt: string | null;
  /** Whether there is anybody to share it WITH. */
  hasClient: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, 'The link could not be changed.')); }
    });

  if (shareToken) {
    return (
      <div className="q-stack q-stack-sm">
        <div className="q-row q-row-between">
          <span className="q-meta">
            Shared{sharedAt ? ` ${new Date(sharedAt).toLocaleDateString()}` : ''} — anyone with this
            link can read it.
          </span>
          {/*
            * Armed, because this is not an edit — it breaks a link that may
            * already be in somebody's inbox, and there is no putting the same
            * one back. Sharing again after this mints a different token.
            */}
          <ConfirmButton
            className="q-btn q-btn-secondary q-btn-sm"
            disabled={isPending}
            confirmLabel="Stop the client seeing it?"
            title="Revoke this link. Sharing again creates a different one."
            onConfirm={() => run(() => unshareBooking({ bookingId }),
              () => toast.ok('The link no longer works.'))}
          >
            Revoke
          </ConfirmButton>
        </div>
        <CopyLinkButton url={`/booking/${shareToken}`} />
      </div>
    );
  }

  return (
    <div className="q-stack q-stack-sm">
      <span className="q-meta">
        Not shared. The client cannot see this booking.
      </span>
      {/*
        * A booking with nobody on it has nobody to send a link to. Said before
        * the press rather than discovered by one — the same rule the contract
        * button on this page follows.
        */}
      {hasClient ? (
        <button
          type="button"
          className="q-btn q-btn-secondary q-btn-sm"
          aria-busy={isPending}
          disabled={isPending}
          onClick={() => run(() => shareBooking({ bookingId }),
            () => toast.ok('The link is ready to send.'))}
        >
          Share with the client
        </button>
      ) : (
        <span className="q-meta-sm">
          Add a client to this booking and it can be shared with them.
        </span>
      )}
    </div>
  );
}

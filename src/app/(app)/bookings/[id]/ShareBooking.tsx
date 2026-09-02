'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shareBooking, unshareBooking } from '@/modules/bookings/interface';
import { DownloadDocumentButton } from '@/components/DownloadDocumentButton';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toast, readableError } from '@/components/Toast';

/**
 * The confirmation the client is sent.
 *
 * A DOCUMENT, NOT A DASHBOARD LINK. What the studio hands over is a file: a
 * statement of what was agreed, when it happens and where the money stands, as
 * of the day it was issued. That is a different thing from a live page — a page
 * changes under the person holding it, and a client who was sent one has no way
 * to tell what they agreed to from what the studio has since edited.
 *
 * THE TOKEN IS PLUMBING, NOT THE PRODUCT. A PDF has to be printed from
 * something: renderPageToPdf loads a URL in a headless browser and says plainly
 * that the URL must open without a session, or it renders the login page. So
 * preparing the document mints a token and the page behind it is what gets
 * printed. It is offered second, and described as what it is — the same
 * document on the web, for a client reading on a phone — rather than led with.
 */
export function ShareBooking({
  bookingId,
  bookingTitle,
  shareToken,
  sharedAt,
  hasClient,
}: {
  bookingId: string;
  bookingTitle: string;
  shareToken: string | null;
  sharedAt: string | null;
  /** Whether there is anybody to send it to. */
  hasClient: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, 'That could not be done.')); }
    });

  const filename = `${bookingTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'booking'}.pdf`;

  if (shareToken) {
    return (
      <div className="q-stack q-stack-sm">
        <div className="q-row q-row-between">
          <span className="q-meta">
            Ready to send{sharedAt ? ` — prepared ${new Date(sharedAt).toLocaleDateString()}` : ''}.
          </span>
          {/*
            * Armed, and worded as what it does to the CLIENT rather than to the
            * row. Withdrawing does not unsend a PDF somebody already has — that
            * file is theirs now — it stops the web copy opening, and saying so
            * is the difference between an operator understanding this control
            * and assuming it recalls the document.
            */}
          <ConfirmButton
            className="q-btn q-btn-secondary q-btn-sm"
            disabled={isPending}
            confirmLabel="Stop the online copy opening?"
            title="Withdraw the web copy. A PDF already sent stays with whoever has it."
            onConfirm={() => run(() => unshareBooking({ bookingId }),
              () => toast.ok('The online copy no longer opens.'))}
          >
            Withdraw
          </ConfirmButton>
        </div>

        <div className="q-row">
          <DownloadDocumentButton
            href={`/booking/${shareToken}/pdf`}
            filename={filename}
            label="Download the confirmation"
          />
          <a
            href={`/booking/${shareToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="q-btn q-btn-secondary"
          >
            Preview
          </a>
        </div>

        <span className="q-meta-sm">
          Send the file to {'“'}{bookingTitle}{'”'}&rsquo;s client however you normally
          would. The same document is on the web for anyone holding its address, which is how
          the file is produced.
        </span>
      </div>
    );
  }

  return (
    <div className="q-stack q-stack-sm">
      <span className="q-meta">
        No confirmation has been prepared for this booking yet.
      </span>
      {/*
        * A booking with nobody on it has nobody to send a document to. Said
        * before the press rather than discovered by one — the rule the contract
        * button on this page already follows.
        */}
      {hasClient ? (
        <button
          type="button"
          className="q-btn q-btn-secondary q-btn-sm"
          aria-busy={isPending}
          disabled={isPending}
          onClick={() => run(() => shareBooking({ bookingId }),
            () => toast.ok('The confirmation is ready.'))}
        >
          Prepare the confirmation
        </button>
      ) : (
        <span className="q-meta-sm">
          Add a client to this booking and a confirmation can be prepared for them.
        </span>
      )}
    </div>
  );
}

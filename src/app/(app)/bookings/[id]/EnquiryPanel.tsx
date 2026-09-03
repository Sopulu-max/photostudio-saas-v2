import React from 'react';
import Link from 'next/link';
import { ExtractPackageButton } from './BookingActions';

/**
 * What a client asked for when they did not pick a package.
 *
 * A custom enquiry arrives with no package, and used to arrive with a booking
 * line that pointed at nothing — a card reading "Services: None" that carried
 * no price, no classifications, no variables and no deliverables, because every
 * one of those hangs off the package a line points at. Worse, that stub line
 * meant the booking was never in the "nothing on this booking yet" state, which
 * is the only place the control for building a package out of the enquiry was
 * rendered. The bridge from a custom enquiry into the rest of the app existed
 * and was unreachable.
 *
 * So the enquiry is shown as what it is — words and answers, not a purchase —
 * with the one action that turns it into something the app can work with.
 *
 * SHOWN IN BOTH PLACES, from one file. The booking page is where an operator
 * reads it and the edit page is where they act on it, and two copies of this
 * would drift the way the two public catalogues did.
 */
export function EnquiryPanel({
  bookingId,
  enquiry,
}: {
  bookingId: string;
  enquiry: {
    message: string | null;
    chosen: { dimension: string; value: string }[];
    extractable: boolean;
  };
}) {
  return (
    <div className="q-tile q-stack q-stack-sm">
      <div>
        <strong className="q-strong">What they asked for</strong>
        <span className="q-meta-sm"> · no package chosen</span>
      </div>

      {enquiry.message && <p className="q-text-body q-prewrap">{enquiry.message}</p>}

      {enquiry.chosen.length > 0 && (
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {enquiry.chosen.map((c, i) => (
            <span
              key={`${c.dimension}-${i}`}
              className="q-badge q-badge-neutral"
              style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}
            >
              <span className="q-meta-plain" style={{ opacity: 0.7 }}>{c.dimension}:</span>
              {c.value}
            </span>
          ))}
        </div>
      )}

      {enquiry.extractable ? (
        <>
          <p className="q-meta-sm">
            A service and package can be built from those answers, and put on this booking.
            Everything a package carries follows from there.
          </p>
          <ExtractPackageButton bookingId={bookingId} label="Build a package from this" />
        </>
      ) : (
        /*
         * Said plainly rather than by offering a button that fails. An enquiry
         * with only a message has nothing structured to build from, and one
         * recorded against a vocabulary the studio has since changed resolves
         * to nothing — in both cases the answer is to choose the package by
         * hand, which the form below already does.
         */
        <p className="q-meta-sm">
          There is nothing here to build a package from automatically —{' '}
          <Link href={`/bookings/${bookingId}/edit`} className="q-plain-link">add one</Link>{' '}
          once you know what they need.
        </p>
      )}
    </div>
  );
}

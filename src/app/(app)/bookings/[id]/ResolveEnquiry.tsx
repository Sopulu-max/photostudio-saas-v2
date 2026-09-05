'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addBookingLine, buildPackageForBooking } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';

/**
 * TURNING WHAT SOMEBODY DESCRIBED INTO SOMETHING THE STUDIO CAN DELIVER.
 *
 * The step the app never had. Intake was built and commitment was built, and
 * between them sat the actual work of a studio receiving an enquiry: deciding
 * what to sell. All that stood in for it was a button that invented a service.
 *
 * IT DESCENDS ONLY AS FAR AS IT NEEDS TO. The client's answers are values in
 * the studio's own vocabulary, so both questions below are set tests rather
 * than guesses:
 *
 *   1. Does something we already SELL cover this? Then sell that.
 *   2. Can something we already DO deliver it? Then assemble a package for this
 *      booking from those capabilities — narrowed to what they answered,
 *      promising what those services already produce, carrying their work.
 *   3. Neither? Then this is genuinely new, and defining it is a catalogue
 *      decision made in the catalogue — not a side effect of one enquiry.
 *
 * The third case is why nothing here creates a service. A classification value
 * is not a capability; treating one as the other is what put a service called
 * "Maternity" in the Videography domain, promising nothing.
 */
export function ResolveEnquiry({
  bookingId,
  chosen,
  message,
  offers,
  capabilities,
  currencyCode,
}: {
  bookingId: string;
  chosen: { dimension: string; value: string }[];
  message: string | null;
  offers: { id: string; name: string; price: any; serviceNames: string[]; carried: number }[];
  capabilities: { id: string; name: string; domainName: string | null; carried: number }[];
  currencyCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string[]>([]);

  const run = (fn: () => Promise<unknown>) => startTransition(async () => {
    try { await fn(); router.refresh(); }
    catch (e) { toast.bad(readableError(e, 'That could not be done.')); }
  });

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="q-tile q-stack q-stack-md">
      <div>
        <strong className="q-strong">What they asked for</strong>
        <span className="q-meta-sm"> · nothing chosen yet</span>
      </div>

      {message && <p className="q-text-body q-prewrap">{message}</p>}

      {chosen.length > 0 && (
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {chosen.map((c, i) => (
            <span key={`${c.dimension}-${i}`} className="q-badge q-badge-neutral"
              style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
              <span className="q-meta-plain" style={{ opacity: 0.7 }}>{c.dimension}:</span>
              {c.value}
            </span>
          ))}
        </div>
      )}

      {/* 1. Something already sold that covers it. */}
      {offers.length > 0 && (
        <div className="q-stack q-stack-sm">
          <strong className="q-strong">You already sell this</strong>
          <span className="q-meta-sm">Best fit first. Adding one puts this booking&rsquo;s own copy of it on the booking.</span>
          {offers.slice(0, 4).map((o) => (
            <div key={o.id} className="q-row q-row-between q-tile-sub">
              <div>
                <strong className="q-strong">{o.name}</strong>
                <div className="q-meta-sm">
                  {o.serviceNames.join(' + ') || 'No services'}
                  {o.price?.base_price != null && ` · ${formatMoney(o.price.base_price, o.price.currency || currencyCode)}`}
                </div>
              </div>
              <button
                type="button"
                className="q-btn q-btn-secondary q-btn-sm"
                disabled={isPending}
                onClick={() => run(() => addBookingLine({ bookingId, packageId: o.id, title: '' }))}
              >
                Put this on the booking
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 2. Nothing sold, but something the studio does. */}
      {capabilities.length > 0 && (
        <div className="q-stack q-stack-sm">
          <strong className="q-strong">
            {offers.length > 0 ? 'Or put something together' : 'You can do this'}
          </strong>
          <span className="q-meta-sm">
            {offers.length > 0
              ? 'Build a package for this booking alone, from what you already do.'
              : 'No package covers this, but these do. Choosing them builds a package for this booking alone — it does not go in your catalogue.'}
          </span>
          {capabilities.map((c) => (
            <label key={c.id} className="q-row q-tile-sub" style={{ gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                disabled={isPending}
                onChange={() => toggle(c.id)}
                style={{ accentColor: 'var(--q-color-accent)' }}
              />
              <span>
                <strong className="q-strong">{c.name}</strong>
                {c.domainName && <span className="q-meta-sm"> · {c.domainName}</span>}
                {/* Why it was offered: how much of what they said it carries
                    outright, as opposed to merely not ruling out. */}
                {c.carried > 0 && (
                  <div className="q-meta-sm">
                    Covers {c.carried} of {chosen.length} {chosen.length === 1 ? 'answer' : 'answers'} outright
                  </div>
                )}
              </span>
            </label>
          ))}
          <div className="q-row">
            <button
              type="button"
              className="q-btn q-btn-primary q-btn-sm"
              disabled={isPending || picked.length === 0}
              onClick={() => run(() => buildPackageForBooking({ bookingId, serviceIds: picked }))}
            >
              {isPending ? 'Putting it together…' : 'Build it for this booking'}
            </button>
            {picked.length === 0 && (
              <span className="q-meta-sm">Choose what delivers this.</span>
            )}
          </div>
        </div>
      )}

      {/* 3. Genuinely new. */}
      {offers.length === 0 && capabilities.length === 0 && (
        <p className="q-meta-sm">
          Nothing you offer or do covers this yet. If it is work you want to take on, define it
          in <Link href="/services" className="q-plain-link">Services</Link> first — that is a
          decision about your catalogue, and it should not be made by one enquiry.
        </p>
      )}
    </div>
  );
}

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
  alreadyOn,
}: {
  bookingId: string;
  chosen: { dimension: string; value: string }[];
  message: string | null;
  offers: { id: string; name: string; price: any; serviceNames: string[]; carried: number }[];
  capabilities: { id: string; name: string; domainName: string | null; carried: number }[];
  currencyCode: string;
  /**
   * Whether something is already on the booking.
   *
   * This used to render only on an empty booking, so the moment one package
   * went on, what the client had actually asked for disappeared — along with
   * any way to act on the rest of it. A client who described a wedding wants
   * photography AND video more often than not, and the second half of that
   * request should not vanish because the first half was answered.
   *
   * So it stays, and steps back: folded away, under a heading that says what it
   * is, rather than presenting itself as the thing to do next.
   */
  alreadyOn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(!alreadyOn);

  const run = (fn: () => Promise<unknown>) => startTransition(async () => {
    try { await fn(); router.refresh(); }
    catch (e) { toast.bad(readableError(e, 'That could not be done.')); }
  });

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="q-tile q-stack q-stack-md">
      <div className="q-row q-row-between">
        <div>
          <strong className="q-strong">Client request</strong>
          <span className="q-meta-sm">
            {alreadyOn ? ' · partly fulfilled' : ' · no package selected'}
          </span>
        </div>
        {alreadyOn && (
          <button type="button" className="q-btn-ghost q-btn-xs" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show options'}
          </button>
        )}
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
      {open && offers.length > 0 && (
        <div className="q-stack q-stack-sm">
          <strong className="q-strong">Matching packages</strong>
          <span className="q-meta-sm">Ranked by fit. Adding one creates this booking&rsquo;s copy of it.</span>
          {offers.slice(0, 4).map((o) => (
            <div key={o.id} className="q-row q-row-between q-tile-sub">
              <div>
                <strong className="q-strong">{o.name}</strong>
                <div className="q-meta-sm">
                  {o.serviceNames.join(' + ') || 'No services'}
                  {o.price?.base_price != null && ` · ${formatMoney(o.price.base_price, o.price.currency || currencyCode)}`}
                </div>
                {/* Why it is here, said out loud — the same reading shown
                    against a capability. An offer ranked without saying why is
                    a recommendation the operator has to take on trust. */}
                {chosen.length > 0 && (
                  <div className="q-meta-sm">
                    {o.carried > 0
                      ? `Matches ${o.carried} of ${chosen.length} ${chosen.length === 1 ? 'classification' : 'classifications'}`
                      : 'No conflicting classifications'}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="q-btn q-btn-secondary q-btn-sm"
                disabled={isPending}
                onClick={() => run(() => addBookingLine({ bookingId, packageId: o.id, title: '' }))}
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 2. Nothing sold, but something the studio does. */}
      {open && capabilities.length > 0 && (
        <div className="q-stack q-stack-sm">
          <strong className="q-strong">
            {offers.length > 0 ? 'Build a package' : 'Available services'}
          </strong>
          <span className="q-meta-sm">
            {offers.length > 0
              ? 'Create a package for this booking from existing services. It is not added to the catalogue.'
              : 'No package covers this request. These services do. Selecting them creates a package for this booking only \u2014 it is not added to the catalogue.'}
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
                    Matches {c.carried} of {chosen.length} {chosen.length === 1 ? 'classification' : 'classifications'}
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
              {isPending ? 'Creating…' : 'Create package'}
            </button>
            {picked.length === 0 && (
              <span className="q-meta-sm">Select at least one service.</span>
            )}
          </div>
        </div>
      )}

      {/* 3. Genuinely new. */}
      {open && offers.length === 0 && capabilities.length === 0 && (
        <p className="q-meta-sm">
          No package or service covers this request. Define the service in{' '}
          <Link href="/services" className="q-plain-link">Services</Link> before booking it.
        </p>
      )}
    </div>
  );
}

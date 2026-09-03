import React from 'react';
import { formatMoney } from '@/kernel/currency';
import { amountOf, firstPriced, hasPrice } from '@/kernel/money';
import { specFromAnswers } from '@/modules/deliverables/shape';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';

/**
 * The booking as a document — what a client is sent once they have booked.
 *
 * A CONFIRMATION, NOT A DASHBOARD. The studio's booking page is a management
 * surface: what is staffed, which tasks are unassigned, how much is still to
 * invoice. None of that is a client's concern, and a document that reported it
 * would be handing over the studio's working notes. What a confirmation states
 * is what was agreed, when it happens, and where the money stands — the four
 * things a client actually needs to be able to check.
 *
 * IT SAYS WHEN IT WAS ISSUED, because that is the difference between a
 * document and a page. A link changes under the person holding it; a document
 * is what was true when it was written, and a client comparing it to what the
 * studio now says is entitled to know which of the two is older. The same
 * reason a contract snapshots its terms.
 *
 * One definition, printed and rendered from the same component — a separate
 * print template would be a second answer to what a confirmation looks like,
 * and the two would disagree the first time somebody edited one.
 */

/**
 * The classifications a document may state: one answer, and only one.
 *
 * A package narrows a domain's vocabulary and a booking narrows the package's.
 * Where the booking settled it, saying so is useful — "Occasion: Wedding" is a
 * fact the client can check. Where it did not, the row still carries every
 * value the package permits, and printing those says the client booked all of
 * them.
 */
function settledClassifications(all: { name: string; value: string }[]) {
  const byDimension = new Map<string, string[]>();
  for (const c of all) {
    if (!c.name) continue;
    byDimension.set(c.name, [...(byDimension.get(c.name) || []), c.value]);
  }
  return [...byDimension.entries()]
    .filter(([, values]) => values.length === 1)
    .map(([name, values]) => ({ name, value: values[0] }));
}

export function BookingDocument({
  booking,
  issuedAt,
}: {
  booking: any;
  /** When this copy was produced. Defaults to now, which is when it is read. */
  issuedAt?: Date;
}) {
  const studio = booking.organization;
  const meta = studio?.metadata || {};
  const money = booking.money;
  const currency = money.currency;
  const issued = issuedAt || new Date();

  const when = booking.scheduled_for
    ? new Date(booking.scheduled_for).toLocaleString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    : null;

  const lines = (booking.booking_lines || []) as any[];

  /*
   * What a client quotes back on the telephone.
   *
   * Bookings carry no number of their own — nothing in the studio's own
   * workflow needs one, and inventing a sequence would be a new thing to keep
   * unique across a multi-tenant table for the sake of a document. The id
   * already is unique, so its first block is taken and shown in a form a
   * person can read out loud.
   */
  const reference = `BK-${String(booking.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;

  /** What a package includes, and what it was booked for, read off the bundle. */
  const readPackage = (line: any) => {
    const bundle = (line.package?.package_services || []) as any[];
    const includes: string[] = [];
    const classifications: { name: string; value: string }[] = [];
    const seen = new Set<string>();
    for (const row of bundle) {
      for (const d of (row.package_deliverables || [])) {
        const name = d.deliverable?.name;
        if (!name) continue;
        /*
         * WHAT WAS SETTLED, ON THE DOCUMENT THE CLIENT KEEPS.
         *
         * This said the name and a count. But a studio that decided softcopy
         * decided it FOR the client, and the confirmation was the one place
         * that never mentioned it — the sentence the declaration exists to
         * produce, missing from the page it matters most on.
         *
         * Rendered through the one formatter, so this reads exactly as the
         * package page and the storefront read.
         */
        includes.push(formatDeliverable({
          name,
          quantity: d.quantity,
          unit: d.deliverable?.default_unit ?? null,
          spec_values: specFromAnswers(row.package_variable_values, d.deliverable.id),
        }));
      }
      for (const c of (row.package_service_dimension_values || [])) {
        const v = c.dimension_value;
        if (!v?.name || seen.has(v.id)) continue;
        seen.add(v.id);
        classifications.push({ name: v.dimension?.name || '', value: v.name });
      }
    }
    return { includes, classifications };
  };

  /*
   * ASKED OF THE KERNEL, NOT RE-READ HERE.
   *
   * The first version of this reached for `price.amount`, which is not the
   * shape a price is stored in — it is `{ base_price, currency }` — so every
   * line on the document printed a dash while the total underneath it printed
   * ₦200,000. Two figures from one price, disagreeing on the same page.
   *
   * That is the exact fault this repository has been bitten by before: a
   * second reader of a stored shape, written by hand, drifting from the one
   * that knows. kernel/money is that one. There is no reason to have a local
   * opinion about where an amount lives.
   */
  const priceOfLine = (line: any) => {
    const p = firstPriced(line.package?.price, line.price);
    return hasPrice(p) ? amountOf(p) * Number(line.quantity ?? 1) : null;
  };

  return (
    <div className="q-doc">
      <div className="q-doc-head">
        <div>
          {meta.logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={meta.logo_url} alt="" className="q-doc-logo" />
          )}
          <div className="q-doc-studio">{studio?.name}</div>
          {meta.address && <div className="q-doc-meta">{meta.address}</div>}
          {meta.contact_email && <div className="q-doc-meta">{meta.contact_email}</div>}
          {meta.contact_phone && <div className="q-doc-meta">{meta.contact_phone}</div>}
        </div>
        <div className="q-doc-head-right">
          <div className="q-doc-kind">Booking confirmation</div>
          {/*
            * A REFERENCE, NOT THE TITLE.
            *
            * This slot is the one an invoice puts INV-0007 in — 1.4rem, bold,
            * right-aligned, sized for a handful of characters. A booking's
            * title is a sentence composed from the client and the package, so
            * a real confirmation went out with "Ngozi Emmanuella Madu —
            * Standard Event Coverage" wrapping across two lines in that style.
            *
            * The title is also redundant here: the block below names the
            * client and the table names the package, so it was saying twice
            * what the document already says properly. What belongs in this
            * slot is the thing neither of those gives — something short the
            * client can quote back when they ring up about it.
            */}
          <div className="q-doc-number">{reference}</div>
          <div className="q-doc-meta">Issued {issued.toLocaleDateString()}</div>
        </div>
      </div>

      <div className="q-doc-parties">
        <div>
          <div className="q-doc-label">Booked by</div>
          <div className="q-doc-strong">{booking.contact?.display_name || '—'}</div>
          {booking.contact?.email && <div className="q-doc-meta">{booking.contact.email}</div>}
          {booking.contact?.phone && <div className="q-doc-meta">{booking.contact.phone}</div>}
        </div>
        <div>
          <div className="q-doc-label">When</div>
          {/*
            * A date that has not been settled says so. Blank would read as an
            * omission, and a client checking their own confirmation for the one
            * fact they care about most should not have to wonder.
            */}
          <div className="q-doc-strong">{when || 'To be arranged'}</div>
          {booking.duration_minutes && (
            <div className="q-doc-meta">
              About {Math.round(Number(booking.duration_minutes) / 60 * 10) / 10} hours
            </div>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <table className="q-doc-table">
          <thead>
            <tr>
              <th>What you have booked</th>
              <th className="q-doc-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const { includes, classifications } = readPackage(line);
              const amount = priceOfLine(line);
              return (
                <tr key={line.id}>
                  <td>
                    <div className="q-doc-strong">
                      {line.package?.name || line.title || 'Booking line'}
                    </div>
                    {line.package?.description && (
                      <div className="q-doc-meta">{line.package.description}</div>
                    )}
                    {/*
                      * ONLY WHAT IS SETTLED, WHICH IS USUALLY NOTHING.
                      *
                      * This listed every value the package permits, so a real
                      * confirmation went out reading "Outdoor · Convocation ·
                      * Anniversary · Birthday · Conference" — the vocabulary
                      * the package accepts, printed as though the client had
                      * booked all five at once.
                      *
                      * A classification is worth stating only where it has
                      * been narrowed to ONE answer, because only then is it a
                      * fact about this booking rather than a range the package
                      * allows. Anything else is the studio's own catalogue
                      * leaking onto a client's document.
                      */}
                    {settledClassifications(classifications).length > 0 && (
                      <div className="q-doc-meta">
                        {settledClassifications(classifications)
                          .map((c) => `${c.name}: ${c.value}`).join(' · ')}
                      </div>
                    )}
                    {/* What the studio is actually going to hand over. The one
                        part of a package a client checks a year later. */}
                    {includes.length > 0 && (
                      <div className="q-doc-meta">Includes: {includes.join(', ')}</div>
                    )}
                  </td>
                  <td className="q-doc-right">
                    {amount == null ? '—' : formatMoney(amount, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="q-doc-totals">
        <div className="q-doc-total-row">
          <span>Agreed</span>
          <span>{formatMoney(money.agreed, currency)}</span>
        </div>
        {/*
          * A concession is stated, not quietly folded into the total. A client
          * who was given something should be able to see that they were, and a
          * studio that gave it should have it on the record they sent.
          */}
        {money.discounted > 0 && (
          <div className="q-doc-total-row q-doc-total-sub">
            <span>Discount</span>
            <span>&minus;{formatMoney(money.discounted, currency)}</span>
          </div>
        )}
        {money.paid > 0 && (
          <div className="q-doc-total-row q-doc-total-sub">
            <span>Paid</span>
            <span>&minus;{formatMoney(money.paid, currency)}</span>
          </div>
        )}
        <div className="q-doc-total-row q-doc-total-final">
          <span>{money.outstanding > 0 ? 'Outstanding' : 'Settled'}</span>
          <span>{formatMoney(money.outstanding, currency)}</span>
        </div>
      </div>

      {/*
        * THEIR OWN WORDS, LAST AND UNTOUCHED.
        *
        * A client reading their confirmation is checking that they were heard.
        * Shown exactly as typed — it is a person's sentence, not a field, and
        * tidying it would be the studio putting words in their mouth.
        */}
      {booking.brief && (
        <div style={{ marginTop: '28px' }}>
          <div className="q-doc-label">What you told us</div>
          <p className="q-doc-meta" style={{ whiteSpace: 'pre-wrap', marginTop: '6px' }}>
            {booking.brief}
          </p>
        </div>
      )}
    </div>
  );
}

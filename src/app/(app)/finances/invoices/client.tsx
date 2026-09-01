'use client';

import React from 'react';
import Link from 'next/link';
import { Receipt } from 'lucide-react';

import { CatalogFilter } from '@/components/CatalogFilter';
import { formatMoney } from '@/kernel/currency';

/**
 * The studio's invoices, as a catalogue.
 *
 * Narrowed by the same component every other list in this app uses, so a
 * studio that knows how to find a package knows how to find an invoice. The
 * facet is the state the money is in — draft, unpaid, part paid, paid,
 * withdrawn — because that is the only question anybody opens this page with.
 */
export function InvoicesClient({
  invoices, currencyCode,
}: {
  invoices: any[];
  currencyCode: string;
}) {
  /*
   * WHAT STATE THE MONEY IS IN — derived, once, here.
   *
   * status alone does not answer it: an issued invoice half paid is neither
   * "sent" nor "paid", and settlementOf already worked that out on the way in.
   * Computed in one place so the facet, the badge and the sort cannot come to
   * disagree about the same invoice.
   */
  const stateOf = (inv: any): string => {
    if (inv.status === 'void') return 'Withdrawn';
    if (inv.settled) return 'Paid';
    if (inv.partly) return 'Part paid';
    if (inv.status === 'draft') return 'Draft';
    return 'Unpaid';
  };

  const badgeFor = (state: string) =>
    state === 'Withdrawn' ? 'q-badge q-badge-danger'
      : state === 'Paid' ? 'q-badge q-badge-success'
        : state === 'Draft' ? 'q-badge q-badge-neutral'
          : 'q-badge q-badge-warning';

  const HOW_TO_ORDER = [
    { key: 'recent', label: 'Newest first',
      compare: (a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')) },
    { key: 'owed', label: 'Most owed first',
      compare: (a: any, b: any) => (b.outstanding ?? 0) - (a.outstanding ?? 0) },
    { key: 'largest', label: 'Largest first',
      compare: (a: any, b: any) => (b.total ?? 0) - (a.total ?? 0) },
    { key: 'due', label: 'Due soonest',
      compare: (a: any, b: any) =>
        String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')) },
  ];

  if (invoices.length === 0) {
    return (
      <div className="q-card q-empty-lg q-stack">
        <div className="q-empty-icon"><Receipt size={24} /></div>
        <h3 className="q-section-title">No invoices yet</h3>
        <p className="q-meta">
          An invoice is raised from a booking, out of what was actually booked, so it always
          agrees with the work. Open a booking to raise the first one.
        </p>
        <Link href="/bookings" className="q-btn q-btn-primary">Go to bookings</Link>
      </div>
    );
  }

  return (
    <CatalogFilter
      items={invoices}
      noun="invoice"
      kind="catalogue"
      // Results are rows either way, so a Cards/List switch would change
      // nothing. See the note on the views prop.
      views={false}
      facetLabel="state"
      sorts={HOW_TO_ORDER}
      read={(inv: any) => ({
        name: inv.number || 'Draft',
        // Searchable by who it is for and what it was raised against, because
        // nobody remembers an invoice by its number.
        description: [inv.contact?.display_name, inv.booking?.title].filter(Boolean).join(' · '),
        facet: stateOf(inv),
        tags: [],
      })}
    >
      {(shown) => (
        <div className="q-stack q-stack-sm">
          {shown.map((inv: any) => {
            const state = stateOf(inv);
            const currency = inv.currency || currencyCode;
            return (
              <Link
                key={inv.id}
                href={`/finances/invoices/${inv.id}`}
                className="q-tile q-row q-row-between q-plain-link q-rise"
              >
                <div>
                  <strong className="q-strong">{inv.number || 'Draft'}</strong>
                  <div className="q-meta-sm">
                    {inv.contact?.display_name || 'No client'}
                    {inv.booking?.title ? ` · ${inv.booking.title}` : ''}
                  </div>
                </div>

                <div className="q-row" style={{ alignItems: 'baseline' }}>
                  {/* What is still owed leads when anything is, because that is
                      the number a studio came here for. The full amount stays
                      beside it, since "₦40,000 left" means nothing without
                      knowing of what. */}
                  {inv.outstanding > 0 && !inv.settled && inv.status !== 'void' ? (
                    <>
                      <span className="q-price">{formatMoney(inv.outstanding, currency)}</span>
                      <span className="q-meta-sm">of {formatMoney(inv.total, currency)}</span>
                    </>
                  ) : (
                    <span className="q-price">{formatMoney(inv.total, currency)}</span>
                  )}
                  <span className={badgeFor(state)}>{state.toLowerCase()}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </CatalogFilter>
  );
}

import React from 'react';
import { formatMoney } from '@/kernel/currency';
import { KINDS, kindOf } from '@/modules/finances/money';

/**
 * The invoice as a document — the thing that gets printed, saved as a PDF and
 * sent to a client.
 *
 * One definition, rendered by both the studio's page and the client's link. A
 * separate print template would be a second source of truth for what an
 * invoice looks like, and the two would disagree within a month.
 *
 * It is also the receipt. Once the payments cover it the heading changes and
 * the outstanding line reads as settled — the same document answering a
 * different question, which is the whole reason there is no receipts table.
 */
export function InvoiceDocument({
  invoice,
  studio,
}: {
  invoice: any;
  studio: { name?: string | null; metadata?: Record<string, any> | null } | null;
}) {
  const currency = invoice.currency || 'USD';
  const meta = studio?.metadata || {};
  const isVoid = invoice.status === 'void';
  const paidInFull = invoice.settled;
  const heading = isVoid ? 'Invoice (withdrawn)' : paidInFull ? 'Receipt' : 'Invoice';

  const booking = invoice.booking;
  const settledPayments = (invoice.payments || [])
    .filter((p: any) => p.status === 'settled')
    .sort((a: any, b: any) => String(a.settled_at || a.created_at).localeCompare(String(b.settled_at || b.created_at)));

  return (
    <div className="q-doc">
      {/* Who it's from */}
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
          <div className="q-doc-kind">{heading}</div>
          <div className="q-doc-number">{invoice.number || 'Draft'}</div>
          {invoice.issued_at && (
            <div className="q-doc-meta">Issued {new Date(invoice.issued_at).toLocaleDateString()}</div>
          )}
          {invoice.due_at && !paidInFull && !isVoid && (
            <div className="q-doc-meta">Due {new Date(invoice.due_at).toLocaleDateString()}</div>
          )}
        </div>
      </div>

      {/* Who it's to, and what it's for */}
      <div className="q-doc-parties">
        <div>
          <div className="q-doc-label">Billed to</div>
          <div className="q-doc-strong">{invoice.contact?.display_name || '—'}</div>
          {invoice.contact?.email && <div className="q-doc-meta">{invoice.contact.email}</div>}
        </div>
        {booking && (
          <div>
            <div className="q-doc-label">For</div>
            <div className="q-doc-strong">{booking.title}</div>
            {booking.scheduled_for && (
              <div className="q-doc-meta">
                {new Date(booking.scheduled_for).toLocaleString(undefined, {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <table className="q-doc-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="q-doc-right">Qty</th>
            <th className="q-doc-right">Each</th>
            <th className="q-doc-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l: any) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td className="q-doc-right">{Number(l.quantity)}</td>
              <td className="q-doc-right">{formatMoney(Number(l.unit_price), currency)}</td>
              <td className="q-doc-right">{formatMoney(Number(l.amount), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="q-doc-totals">
        <div className="q-doc-total-row">
          <span>Total</span>
          <span>{formatMoney(invoice.total, currency)}</span>
        </div>

        {settledPayments.map((p: any) => {
          const spec = KINDS[kindOf(p)];
          return (
            <div key={p.id} className="q-doc-total-row q-doc-total-sub">
              <span>
                {String(p.type).replace(/_/g, ' ')}
                {' · '}
                {new Date(p.settled_at || p.created_at).toLocaleDateString()}
              </span>
              <span>
                {spec.direction === 'inbound' ? '−' : '+'}{formatMoney(Number(p.amount), p.currency || currency)}
              </span>
            </div>
          );
        })}

        {!isVoid && (
          <div className="q-doc-total-row q-doc-total-final">
            <span>{paidInFull ? 'Paid in full' : 'Outstanding'}</span>
            <span>{formatMoney(invoice.outstanding, currency)}</span>
          </div>
        )}
      </div>

      {/* How to pay — the part that makes it an invoice rather than a number.
          Pointless once it's settled, so it stops printing. */}
      {!paidInFull && !isVoid && meta.payment_instructions && (
        <div className="q-doc-pay">
          <div className="q-doc-label">How to pay</div>
          <div className="q-doc-pre">{meta.payment_instructions}</div>
        </div>
      )}

      {invoice.notes && <p className="q-doc-note">{invoice.notes}</p>}
      {meta.invoice_footer && <p className="q-doc-footer">{meta.invoice_footer}</p>}
    </div>
  );
}

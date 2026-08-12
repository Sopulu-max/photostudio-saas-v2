import React from 'react';
import { formatMoney } from '@/kernel/currency';
import { KINDS, kindOf, settlementOf } from '@/modules/finances/money';

/**
 * A receipt: the acknowledgement of one payment.
 *
 * Not the invoice restated. A deposit paid against an unpaid invoice earns a
 * receipt for the deposit, today, and the invoice stays outstanding — which is
 * why this says what was received and then, separately, where that leaves the
 * invoice it belongs to.
 *
 * It shares the document CSS with the invoice on purpose: a client who has
 * seen one should recognise the other as coming from the same studio.
 */
export function ReceiptDocument({
  payment,
  studio,
}: {
  payment: any;
  studio: { name?: string | null; metadata?: Record<string, any> | null } | null;
}) {
  const meta = studio?.metadata || {};
  const currency = payment.currency || 'USD';
  const spec = KINDS[kindOf(payment)];
  const isRefund = spec.direction === 'outbound';
  const receivedAt = payment.settled_at || payment.receipt_issued_at || payment.created_at;

  // Where the invoice stands after this payment, worked out the same way the
  // invoice itself works it out — one rule, so the two can't disagree.
  const invoice = payment.invoice;
  const invoiceTotal = invoice
    ? (invoice.lines || []).reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
    : 0;
  const standing = invoice ? settlementOf(invoiceTotal, invoice.payments || []) : null;

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
          <div className="q-doc-kind">{isRefund ? 'Refund receipt' : 'Receipt'}</div>
          <div className="q-doc-number">{payment.receipt_number}</div>
          {receivedAt && (
            <div className="q-doc-meta">{new Date(receivedAt).toLocaleDateString()}</div>
          )}
        </div>
      </div>

      <div className="q-doc-parties">
        <div>
          <div className="q-doc-label">{isRefund ? 'Refunded to' : 'Received from'}</div>
          <div className="q-doc-strong">{payment.contact?.display_name || '—'}</div>
          {payment.contact?.email && <div className="q-doc-meta">{payment.contact.email}</div>}
        </div>
        {payment.booking && (
          <div>
            <div className="q-doc-label">For</div>
            <div className="q-doc-strong">{payment.booking.title}</div>
            {payment.booking.scheduled_for && (
              <div className="q-doc-meta">
                {new Date(payment.booking.scheduled_for).toLocaleDateString(undefined, {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
            )}
          </div>
        )}
        {invoice?.number && (
          <div>
            <div className="q-doc-label">Against</div>
            <div className="q-doc-strong">{invoice.number}</div>
          </div>
        )}
      </div>

      <table className="q-doc-table">
        <thead>
          <tr>
            <th>{isRefund ? 'Refund' : 'Payment'}</th>
            <th className="q-doc-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {String(payment.type).replace(/_/g, ' ')}
              {receivedAt && ` · ${new Date(receivedAt).toLocaleDateString()}`}
            </td>
            <td className="q-doc-right">{formatMoney(Number(payment.amount), currency)}</td>
          </tr>
        </tbody>
      </table>

      <div className="q-doc-totals">
        <div className="q-doc-total-row q-doc-total-final">
          <span>{isRefund ? 'Refunded' : 'Received'}</span>
          <span>{formatMoney(Number(payment.amount), currency)}</span>
        </div>

        {/* What this payment leaves behind. Saying it here is the difference
            between a receipt and a note — the client knows where they stand. */}
        {standing && invoiceTotal > 0 && (
          <>
            <div className="q-doc-total-row q-doc-total-sub">
              <span>{invoice.number} total</span>
              <span>{formatMoney(invoiceTotal, invoice.currency || currency)}</span>
            </div>
            <div className="q-doc-total-row q-doc-total-sub">
              <span>{standing.settled ? 'Nothing outstanding' : 'Still outstanding'}</span>
              <span>{formatMoney(standing.outstanding, invoice.currency || currency)}</span>
            </div>
          </>
        )}
      </div>

      {meta.invoice_footer && <p className="q-doc-footer">{meta.invoice_footer}</p>}
    </div>
  );
}

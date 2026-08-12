import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getInvoice, KINDS, kindOf } from '@/modules/finances/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { InvoiceActions, InvoiceLineEditor, RecordPaymentForm } from './client';

export const dynamic = 'force-dynamic';

/**
 * One invoice, as a document.
 *
 * A draft is a working surface — the lines came from the booking and can still
 * be argued with. An issued one is frozen and reads as the thing the client is
 * holding, which is also, once its payments cover it, the receipt.
 */
export default async function InvoicePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [invoice, studio, studioCurrency] = await Promise.all([
    getInvoice(params.id),
    getStudio(),
    getStudioCurrency(),
  ]);
  if (!invoice) notFound();

  const currency = invoice.currency || studioCurrency;
  const isDraft = invoice.status === 'draft';
  const isVoid = invoice.status === 'void';
  const shareUrl = invoice.share_token && studio?.slug
    ? `${process.env.NEXT_PUBLIC_SITE_URL || ''}/invoice/${invoice.share_token}`
    : null;

  // The document's own state, said once: paid is derived from the money, so
  // this can never disagree with the payments listed below it.
  const standing = isVoid ? 'Withdrawn'
    : invoice.settled ? 'Paid in full'
    : invoice.partly ? 'Part paid'
    : isDraft ? 'Not sent yet'
    : 'Awaiting payment';

  return (
    <div className="q-page-narrow">
      <Link href="/finances" className="q-back">&larr; Back to Finances</Link>

      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{invoice.number || 'Draft invoice'}</h1>
          <p className="q-page-subtitle">
            {invoice.contact?.display_name || 'No client attached'}
            {invoice.booking?.title ? ` · ${invoice.booking.title}` : ''}
          </p>
        </div>
        <div className="q-row">
          <span className={`q-badge ${
            isVoid ? 'q-badge-danger'
            : invoice.settled ? 'q-badge-success'
            : isDraft ? 'q-badge-neutral' : 'q-badge-warning'
          }`}>
            {standing}
          </span>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        <div className="q-card q-section">
          <div className="q-row q-row-between" style={{ marginBottom: '16px' }}>
            <h2 className="q-section-title" style={{ margin: 0 }}>What this is for</h2>
            {isDraft && <span className="q-meta-sm">Generated from the booking — change it before you send it</span>}
          </div>

          {isDraft ? (
            <InvoiceLineEditor
              invoiceId={invoice.id}
              currencyCode={currency}
              lines={invoice.lines.map((l: any) => ({
                description: l.description,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unit_price),
              }))}
            />
          ) : invoice.lines.length === 0 ? (
            <p className="q-empty">Nothing on this invoice.</p>
          ) : (
            <div className="q-table-container">
              <table className="q-table">
                <thead>
                  <tr>
                    <th className="q-table-th">Description</th>
                    <th className="q-table-th">Qty</th>
                    <th className="q-table-th">Each</th>
                    <th className="q-table-th">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l: any) => (
                    <tr key={l.id} className="q-table-tr">
                      <td className="q-table-td q-strong">{l.description}</td>
                      <td className="q-table-td q-num">{Number(l.quantity)}</td>
                      <td className="q-table-td q-num">{formatMoney(Number(l.unit_price), currency)}</td>
                      <td className="q-table-td q-num q-strong">{formatMoney(Number(l.amount), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="q-tile-sub q-row q-row-between">
            <span className="q-meta">Total</span>
            <strong className="q-stat-value q-num">{formatMoney(invoice.total, currency)}</strong>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Where it stands</h2>
          <div className="q-grid-3">
            <div className="q-panel">
              <div className="q-stat-label">Invoiced</div>
              <div className="q-stat-value-lg q-num">{formatMoney(invoice.total, currency)}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Paid</div>
              <div className="q-stat-value-lg q-num">{formatMoney(invoice.paid, currency)}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Outstanding</div>
              <div className={`q-stat-value-lg q-num${invoice.outstanding > 0 ? ' q-warm' : ''}`}>
                {formatMoney(invoice.outstanding, currency)}
              </div>
            </div>
          </div>

          <div className="q-stack q-stack-sm" style={{ marginTop: '18px' }}>
            {invoice.payments.length === 0 ? (
              <p className="q-empty">Nothing paid against this yet.</p>
            ) : (
              invoice.payments
                .slice()
                .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
                .map((p: any) => {
                  const spec = KINDS[kindOf(p)];
                  return (
                    <div key={p.id} className="q-tile q-row q-row-between">
                      <div>
                        <strong className="q-strong q-cap">{String(p.type).replace(/_/g, ' ')}</strong>
                        <div className="q-meta-sm">
                          {p.status === 'settled'
                            ? `Received ${new Date(p.settled_at || p.created_at).toLocaleDateString()}`
                            : p.status}
                        </div>
                      </div>
                      <span className="q-strong q-num">
                        {spec.direction === 'outbound' ? '−' : ''}{formatMoney(Number(p.amount), p.currency || currency)}
                      </span>
                    </div>
                  );
                })
            )}
            {!isVoid && (
              <RecordPaymentForm
                invoiceId={invoice.id}
                contactId={invoice.contact?.id ?? null}
                bookingId={invoice.booking?.id ?? null}
                currencyCode={currency}
                outstanding={invoice.outstanding}
              />
            )}
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">The document</h2>
          <div className="q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
            <div className="q-tile q-row q-row-between">
              <span className="q-meta">Issued</span>
              <span>{invoice.issued_at ? new Date(invoice.issued_at).toLocaleString() : 'Not yet'}</span>
            </div>
            {invoice.due_at && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Due</span>
                <span>{new Date(invoice.due_at).toLocaleDateString()}</span>
              </div>
            )}
            {invoice.booking && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Booking</span>
                <Link href={`/bookings/${invoice.booking.id}`} className="q-link">{invoice.booking.title}</Link>
              </div>
            )}
          </div>
          <InvoiceActions
            invoiceId={invoice.id}
            status={invoice.status}
            hasLines={invoice.lines.length > 0}
            shareUrl={shareUrl}
          />
        </div>
      </div>
    </div>
  );
}

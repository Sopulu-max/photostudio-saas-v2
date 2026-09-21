import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getInvoice, KINDS, kindOf } from '@/modules/finances/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { InvoiceActions, RecordPaymentForm } from './client';
import { SendInvoice } from './SendInvoice';
import { InvoiceDocument } from '@/components/InvoiceDocument';
import { PrintDocumentButton } from '@/components/PrintDocumentButton';
import { DownloadDocumentButton } from '@/components/DownloadDocumentButton';

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
  // A path, not a URL: the origin is only known in the browser, and a relative
  // link pasted into WhatsApp is a dead link.
  const sharePath = invoice.share_token ? `/invoice/${invoice.share_token}` : null;

  // The document's own state, said once: paid is derived from the money, so
  // this can never disagree with the payments listed below it.
  const standing = isVoid ? 'Withdrawn'
    : invoice.settled ? 'Paid in full'
    : invoice.partly ? 'Part paid'
    : isDraft ? 'Not sent yet'
    : 'Awaiting payment';

  return (
    <div className="q-page-narrow">
      <Link href="/finances" className="q-back q-noprint">&larr; Back to Finances</Link>

      <header className="q-page-header q-noprint">
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

      <div className="q-stack q-stack-lg q-noprint">

        <div className="q-card q-section">
          <div className="q-row q-row-between" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 className="q-section-title" style={{ margin: 0 }}>What this is for</h2>
            {/*
              * A DRAFT'S LINES ARE THE BOOKING'S. The package at its price for
              * this booking, each extra, each charge - read from the booking
              * and following it until the invoice is issued. They were free
              * text boxes here, and editing them cut the draft loose from the
              * booking. A figure is changed where it lives, once.
              */}
            {isDraft && invoice.booking?.id && (
              <span className="q-meta-sm">
                Read from the booking, and follows it until issued.{' '}
                <Link href={`/bookings/${invoice.booking.id}/edit`} className="q-plain-link">Change the price, extras or charges there</Link>.
              </span>
            )}
          </div>

          {invoice.lines.length === 0 ? (
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
                  {invoice.lines.map((l: any) => {
                    // What each row is - said by Finances on the row (kind),
                    // stamped here where it is not the package itself.
                    return (
                    <tr key={l.id} className="q-table-tr">
                      <td className={l.kind === 'extra' ? 'q-table-td q-doc-sub' : 'q-table-td q-strong'}>
                        {l.description}
                        {l.kind === 'extra' && <span className="q-meta-sm" style={{ marginLeft: '8px', fontWeight: 400 }}>Extra</span>}
                        {l.kind === 'charge' && <span className="q-meta-sm" style={{ marginLeft: '8px', fontWeight: 400 }}>Charge</span>}
                      </td>
                      <td className="q-table-td q-num">{Number(l.quantity)}</td>
                      <td className="q-table-td q-num">{formatMoney(Number(l.unit_price), currency)}</td>
                      <td className="q-table-td q-num q-strong">{formatMoney(Number(l.amount), currency)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/*
            * HOW IT GOT TO THE TOTAL.
            *
            * This document showed one figure and no arithmetic. A studio
            * charging tax billed it and never said so here; a studio giving a
            * discount would show a smaller number with nothing to say where the
            * rest went, which is the version a client queries.
            *
            * Drawn only where something happened between the lines and the
            * total — a plain invoice with no tax and no concession still says
            * its total once, which is all it has to say.
            */}
          {(invoice.discount > 0 || invoice.tax > 0) && (
            <div className="q-stack q-stack-sm" style={{ marginTop: '8px' }}>
              <div className="q-row q-row-between">
                <span className="q-meta">Subtotal</span>
                <span className="q-num">{formatMoney(invoice.subtotal, currency)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="q-row q-row-between">
                  <span className="q-meta">
                    Discount{invoice.discountKind === 'percentage' && invoice.discountValue != null
                      ? ` (${invoice.discountValue}%)` : ''}
                  </span>
                  <span className="q-num q-text-danger">&minus;{formatMoney(invoice.discount, currency)}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="q-row q-row-between">
                  <span className="q-meta">Tax ({invoice.taxRate}%)</span>
                  <span className="q-num">{formatMoney(invoice.tax, currency)}</span>
                </div>
              )}
            </div>
          )}

          <div className="q-tile-sub q-row q-row-between">
            <span className="q-meta">Total</span>
            <strong className="q-stat-value q-num">{formatMoney(invoice.total, currency)}</strong>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Status</h2>
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
                      <div className="q-row">
                        <span className="q-strong q-num">
                          {spec.direction === 'outbound' ? '−' : ''}{formatMoney(Number(p.amount), p.currency || currency)}
                        </span>
                        {p.receipt_number && p.receipt_token && (
                          <Link href={`/receipt/${p.receipt_token}`} className="q-btn q-btn-secondary q-btn-xs" target="_blank">
                            {p.receipt_number}
                          </Link>
                        )}
                      </div>
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
            sharePath={sharePath}
          />
        </div>
      </div>

      {/*
        What the client actually receives, rendered from the same component
        their link renders — so there is no version of this the studio hasn't
        seen. Printing hides everything above it.
      */}
      <div style={{ marginTop: '32px' }}>
        <div className="q-row q-row-between q-noprint" style={{ marginBottom: '12px' }}>
          <h2 className="q-section-title" style={{ margin: 0 }}>
            {invoice.settled ? 'The receipt they get' : 'The document they get'}
          </h2>
          <div className="q-row">
            {sharePath && (
              <DownloadDocumentButton
                href={`${sharePath}/pdf`}
                filename={`${invoice.number || 'invoice'}.pdf`}
                primary={false}
              />
            )}
            <PrintDocumentButton label="Print" />
            {sharePath && (
              <SendInvoice
                sharePath={sharePath}
                clientName={invoice.contact?.display_name ?? null}
                clientEmail={invoice.contact?.email ?? null}
                studioName={studio?.name || 'the studio'}
                number={invoice.number || 'draft'}
                amountLabel={formatMoney(invoice.total, currency)}
                paidInFull={invoice.settled}
              />
            )}
          </div>
        </div>
        {isDraft && (
          <p className="q-meta q-noprint" style={{ marginBottom: '12px' }}>
            Still a draft — issue it before sending, so it carries a number.
          </p>
        )}
        <InvoiceDocument invoice={invoice} studio={studio} />
      </div>
    </div>
  );
}

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getInvoice, KINDS, kindOf } from '@/modules/finances/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { InvoiceActions, InvoiceLineEditor, RecordPaymentForm } from './client';
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

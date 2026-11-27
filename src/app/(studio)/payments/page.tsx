import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { bookingInvoicesPage } from '@/weave/payments/queries';
import { invoiceBalance, type InvoiceSummary } from '@/weave/payments/shape';
import { money } from '@/weave/store/shape';

export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function InvoiceRow({ invoice }: { invoice: InvoiceSummary }) {
  const { status, balance } = invoiceBalance(invoice);
  const amount = balance > 0 ? `${money(balance, invoice.currency)} due`
    : money(invoice.totalMinor, invoice.currency);

  return (
    <li className="q-payment-index-item">
      <Link
        href={`/payments/${invoice.number}`}
        className="q-row-link q-payment-index-row"
      >
        <span className="q-dashboard-row-label">
          <strong className="q-strong">Invoice {invoice.number} · {invoice.clientName ?? 'No client name'}</strong>
          <span className="q-meta q-invoice-text">{invoice.description}</span>
          <time dateTime={invoice.issuedAt} className="q-meta-sm">{day.format(new Date(invoice.issuedAt))}</time>
        </span>
        <span className="q-payment-index-amount">
          <strong className="q-num">{amount}</strong>
          <span className={balance > 0 ? 'q-meta q-warm' : 'q-meta'}>{status}</span>
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}

export default async function PaymentsPage({ searchParams }: {
  searchParams: Promise<{ before?: string | string[] }>;
}) {
  if (!await whoIsAsking()) redirect('/login');

  const { before } = await searchParams;
  const cursor = typeof before === 'string' && /^\d+$/.test(before) ? Number(before) : null;
  const previous = cursor !== null && Number.isSafeInteger(cursor) && cursor > 0 ? cursor : null;
  const page = await bookingInvoicesPage(previous);

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Payments</h1>
          <p className="q-page-subtitle">Booking invoices and balances</p>
        </div>
        <Link href="/bookings" className="q-btn q-btn-secondary q-btn-sm">View bookings</Link>
      </header>

      {page === null ? <p className="q-note q-note-bad">Booking invoices unavailable</p>
        : page.invoices.length === 0 ? (
          <section className="q-card q-stack q-stack-xs" aria-label="Booking invoices">
            <p className="q-reading">{previous === null ? 'No booking invoices' : 'No older invoices'}</p>
            {previous === null && <p className="q-note">Issue an invoice from a confirmed booking.</p>}
          </section>
        ) : (
          <ul className="q-card q-invoice-history" aria-label="Booking invoices">
            {page.invoices.map((invoice) => <InvoiceRow key={invoice.number} invoice={invoice} />)}
          </ul>
        )}

      {(page?.nextBefore || previous !== null) && (
        <nav className="q-row q-payment-index-nav" aria-label="Invoice pages">
          {previous !== null && <Link className="q-btn q-btn-ghost q-btn-xs" href="/payments">Latest invoices</Link>}
          {page?.nextBefore && (
            <Link className="q-btn q-btn-secondary q-btn-xs" href={`/payments?before=${page.nextBefore}`}>Older invoices</Link>
          )}
        </nav>
      )}
    </div>
  );
}

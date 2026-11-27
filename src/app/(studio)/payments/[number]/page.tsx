import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoiceAmounts } from '@/components/InvoiceAmounts';
import { InvoicePaymentHistory } from '@/components/InvoicePaymentHistory';
import { PackageLines } from '@/components/PackageLines';
import { bookingInvoiceDetails } from '@/weave/payments/queries';
import { invoiceBalance } from '@/weave/payments/shape';

export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

export default async function PaymentDetailsPage({ params }: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  if (!/^[1-9]\d*$/.test(number)) notFound();
  const invoice = await bookingInvoiceDetails(Number(number));
  if (!invoice) notFound();

  const { status } = invoiceBalance(invoice);
  const invoicePath = `/invoice/${invoice.shareToken}`;

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div className="q-stack q-stack-xs">
          <Link className="q-auth-link" href="/payments">Payments</Link>
          <h1 className="q-page-title">Invoice {invoice.number}</h1>
          <p className="q-page-subtitle q-invoice-text">{invoice.clientName ?? 'No client name'}</p>
          <p className="q-meta">
            <time dateTime={invoice.issuedAt}>{day.format(new Date(invoice.issuedAt))}</time> · {invoice.currency} · {status}
          </p>
        </div>
        <Link className="q-btn q-btn-secondary q-btn-sm" href={`/bookings/${invoice.bookingId}#booking-payments`}>
          Manage booking payments
        </Link>
      </header>

      <div className="q-stack q-stack-md">
        <section className="q-card q-stack q-stack-sm">
          <h2 className="q-section-title">Invoice breakdown</h2>
          {invoice.packageLines.length > 0
            ? <PackageLines lines={invoice.packageLines} currency={invoice.currency} />
            : <p className="q-note q-invoice-text">{invoice.description}</p>}
          <InvoiceAmounts invoice={invoice} packageLines={invoice.packageLines} />
          <div className="q-row">
            <a className="q-auth-link" href={invoicePath} target="_blank" rel="noopener noreferrer">View client invoice</a>
          </div>
        </section>

        <section className="q-card q-stack q-stack-sm">
          <h2 className="q-section-title">Payment history</h2>
          <InvoicePaymentHistory invoice={invoice} invoicePath={invoice.voidedAt === null ? invoicePath : undefined} />
        </section>

        {invoice.instructions && (
          <section className="q-card q-stack q-stack-xs">
            <h2 className="q-section-title">Payment instructions</h2>
            <p className="q-note q-invoice-text">{invoice.instructions}</p>
          </section>
        )}
      </div>
    </div>
  );
}

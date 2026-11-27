import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InvoiceAmounts } from '@/components/InvoiceAmounts';
import { InvoiceReceipts } from '@/components/InvoiceReceipts';
import { PackageLines } from '@/components/PackageLines';
import { sharedInvoice } from '@/weave/payments/queries';
import { invoiceBalance } from '@/weave/payments/shape';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Booking invoice',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await sharedInvoice(token);
  if (!invoice) notFound();

  const { balance, status } = invoiceBalance(invoice);
  const issued = new Date(invoice.issuedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return (
    <main className="q-invoice-public" data-surface="client">
      <article className="q-card q-invoice-document q-stack q-stack-md">
        <header className="q-stack q-stack-xs">
          <p className="q-note q-invoice-text">{invoice.studioName}</p>
          <h1 className="q-page-title">Invoice {invoice.number}</h1>
          <p className="q-note">
            <time dateTime={invoice.issuedAt}>{issued}</time> · {invoice.currency} · {status}
          </p>
        </header>

        <section className="q-stack q-stack-xs" aria-label="Booking details">
          {invoice.clientName && <p className="q-note q-invoice-text">Billed to {invoice.clientName}</p>}
          {invoice.packageLines.length > 0
            ? <PackageLines lines={invoice.packageLines} currency={invoice.currency} />
            : <p className="q-reading q-invoice-text">{invoice.description}</p>}
        </section>

        <InvoiceAmounts invoice={invoice} packageLines={invoice.packageLines} />

        <section className="q-stack q-stack-xs">
          <h2 className="q-reading">Payment history</h2>
          <InvoiceReceipts payments={invoice.payments} currency={invoice.currency} invoicePath={`/invoice/${token}`} />
        </section>

        {balance > 0 && invoice.instructions && (
          <section className="q-stack q-stack-xs">
            <h2 className="q-reading">Payment instructions</h2>
            <p className="q-note q-invoice-text">{invoice.instructions}</p>
          </section>
        )}
      </article>
    </main>
  );
}

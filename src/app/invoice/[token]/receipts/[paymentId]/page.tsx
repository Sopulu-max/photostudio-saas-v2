import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaymentDate } from '@/components/InvoiceReceipts';
import { sharedInvoice } from '@/weave/payments/queries';
import { money } from '@/weave/store/shape';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Payment receipt',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ReceiptPage({ params }: { params: Promise<{ token: string; paymentId: string }> }) {
  const { token, paymentId } = await params;
  const invoice = await sharedInvoice(token, paymentId);
  const payment = invoice?.payments[0];
  if (!invoice || invoice.voidedAt || !payment) notFound();

  return (
    <main className="q-invoice-public" data-surface="client">
      <article className="q-card q-invoice-document q-stack q-stack-md">
        <header className="q-stack q-stack-xs">
          <p className="q-note q-invoice-text">{invoice.studioName}</p>
          <h1 className="q-page-title">Payment receipt</h1>
          <p className="q-note"><PaymentDate date={payment.receivedOn} /> · {invoice.currency}</p>
        </header>
        <section className="q-stack q-stack-xs" aria-label="Booking details">
          {invoice.clientName && <p className="q-note q-invoice-text">Billed to {invoice.clientName}</p>}
          <p className="q-reading q-invoice-text">{invoice.description}</p>
        </section>
        <dl className="q-invoice-amounts">
          <div className="q-invoice-line q-invoice-balance">
            <dt className="q-strong">Amount received</dt>
            <dd className="q-num">{money(payment.amountMinor, invoice.currency)}</dd>
          </div>
        </dl>
        <a className="q-auth-link" href={`/invoice/${token}`}>View invoice {invoice.number}</a>
      </article>
    </main>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { InvoiceReceipts } from '@/components/InvoiceReceipts';
import { whoIsAsking } from '@/weave/studio';
import { readClient, workFor } from '@/weave/clients/actions';
import { sayClient } from '@/weave/clients/shape';
import { money } from '@/weave/store/shape';
import { sayWhen } from '@/weave/bookings/shape';
import { clientInvoices } from '@/weave/payments/queries';
import { invoiceBalance } from '@/weave/payments/shape';

export const dynamic = 'force-dynamic';

/** A date as the studio reads one. */
function on(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * One client.
 *
 * Their work, and nothing about them that is not derived from it. There is no
 * row anywhere recording what a studio THINKS of a client — no note, no source,
 * no tag — and that absence is real rather than an oversight on this page:
 * employment aside, nothing in this system is stored that an edge can supply,
 * and a note is the next thing with no edge behind it.
 */
export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const { id } = await params;

  const [client, work, invoices] = await Promise.all([readClient(id), workFor(id), clientInvoices(id)]);
  if (!client) notFound();

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{client.name}</h1>
          <p className="q-page-subtitle">{sayClient(client)}</p>
        </div>
      </header>

      <div className="q-stack q-stack-md">
        {/*
          * How to reach them. Said as facts rather than as labelled fields,
          * and an absence is stated: a studio with no phone number for
          * somebody should be able to see that it has none.
          */}
        <section className="q-stack q-stack-xs">
          <h2 className="q-section-title">Contact</h2>
          <p className="q-text-body">{client.email ?? 'No email address'}</p>
          <p className="q-text-body">{client.phone ?? 'No phone number'}</p>
          {/*
            * No account state. Nothing can give a client one yet, so it said
            * the same thing on every client and offered nothing to do about
            * it. It comes back attached to the invite, not before.
            */}
          <p className="q-meta">
            Known to the studio since {on(client.since.slice(0, 10))}
          </p>
        </section>

        <section className="q-stack q-stack-sm">
          <h2 className="q-section-title">
            {work.length === 0
              ? 'No bookings'
              : `${work.length} ${work.length === 1 ? 'booking' : 'bookings'}`}
          </h2>
          {work.map((booking) => (
            <Link
              className="q-row q-row-between q-row-link"
              key={booking.id}
              href={`/bookings/${booking.id}`}
            >
              {/*
                * What the day is, and when. The row said only the notes for a
                * while, so a client's bookings were a list of sentences with
                * nothing saying what any of them were or when.
                */}
              <span className="q-stack q-stack-xs">
                <strong className="q-strong">
                  {booking.occasion ?? booking.wants ?? 'No occasion given'}
                </strong>
                <span className="q-meta">{sayWhen(booking.on, booking.at)}</span>
              </span>
              {/*
                * Whose move it is, derived from the timestamps rather than
                * read off a status column. Agreed work says nothing, because
                * agreed is the ordinary case and silence is the good news.
                */}
              {booking.standing !== 'agreed' && (
                <span className={booking.standing === 'declined' ? 'q-answer q-answer-no' : 'q-answer'}>
                  {booking.standing === 'declined' ? 'Declined' : 'Awaiting an answer'}
                </span>
              )}
            </Link>
          ))}
        </section>

        <section className="q-stack q-stack-sm" aria-labelledby="client-billing">
          <h2 className="q-section-title" id="client-billing">Booking payments</h2>
          {invoices === null && <p className="q-note q-note-bad">Booking payments unavailable</p>}
          {invoices?.length === 0 && <p className="q-empty">No booking invoices</p>}
          {invoices?.map((invoice) => {
            const { balance, status } = invoiceBalance(invoice);
            const invoicePath = `/invoice/${invoice.shareToken}`;

            return (
              <article className="q-card q-stack q-stack-sm" key={invoice.number}>
                <header className="q-stack q-stack-xs">
                  <h3 className="q-reading">Invoice {invoice.number}</h3>
                  <p className="q-note q-invoice-text">{invoice.description}</p>
                  <p className="q-meta">{on(invoice.issuedAt.slice(0, 10))} · {status}</p>
                </header>
                <p className="q-note">
                  {money(invoice.totalMinor, invoice.currency)} total
                  {balance > 0 && ` · ${money(balance, invoice.currency)} due`}
                </p>
                <div className="q-row q-row-sm">
                  <a className="q-auth-link" href={invoicePath}>View invoice</a>
                  <Link className="q-auth-link" href={`/bookings/${invoice.bookingId}#booking-payments`}>
                    Open booking
                  </Link>
                </div>
                {invoice.voidedAt === null && (
                  <InvoiceReceipts payments={invoice.payments} currency={invoice.currency} invoicePath={invoicePath} />
                )}
              </article>
            );
          })}
        </section>

        {client.spent > 0 && (
          <section className="q-stack q-stack-xs">
            <h2 className="q-section-title">
              {money(client.spent, client.currency)} spent on prints
            </h2>
            <Link className="q-auth-link" href="/orders">Orders</Link>
          </section>
        )}
      </div>
    </div>
  );
}

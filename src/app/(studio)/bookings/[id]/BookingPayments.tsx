'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { InvoiceAmounts } from '@/components/InvoiceAmounts';
import { InvoiceFields, PaymentFields } from '@/components/InvoiceFields';
import { InvoicePaymentHistory } from '@/components/InvoicePaymentHistory';
import { PackageLines } from '@/components/PackageLines';
import { issueInvoice, recordPayment, voidInvoice, voidPayment } from '@/weave/payments/actions';
import { invoiceBalance, type BookingBilling } from '@/weave/payments/shape';

type Confirm = { kind: 'invoice' } | { kind: 'payment'; id: string };
type Result = Awaited<ReturnType<typeof issueInvoice>>;

export function BookingPayments({ bookingId, billing, origin, today }: {
  bookingId: string;
  billing: BookingBilling | null;
  origin: string;
  today: string;
}) {
  const [panel, setPanel] = useState<'issue' | 'record' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, start] = useTransition();
  const paymentKey = useRef<string | null>(null);
  const invoices = billing?.invoices ?? [];
  const active = invoices.find((invoice) => invoice.voidedAt === null);
  const archived = invoices.filter((invoice) => invoice.voidedAt !== null);
  const totals = active ? invoiceBalance(active) : null;

  const open = (next: 'issue' | 'record' | null) => {
    setPanel(next);
    setConfirm(null);
    setProblem(null);
    setNotice(null);
  };

  const run = (write: () => Promise<Result>, message: string) => {
    setProblem(null);
    setNotice(null);
    start(async () => {
      try {
        const result = await write();
        if (!result.ok) {
          setProblem(result.problem);
          return;
        }
        paymentKey.current = null;
        setPanel(null);
        setConfirm(null);
        setNotice(message);
      } catch {
        setProblem('Could not save the payment record. Try again.');
      }
    });
  };

  const onIssue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => issueInvoice(bookingId, form), 'Invoice issued.');
  };

  const onRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active) return;
    const form = new FormData(event.currentTarget);
    const id = paymentKey.current ?? crypto.randomUUID();
    paymentKey.current = id;
    run(() => recordPayment(bookingId, active.id, id, form), 'Payment recorded.');
  };

  const copyLink = async (url: string) => {
    setProblem(null);
    setNotice(null);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Invoice link copied.');
    } catch {
      setProblem('Could not copy the link. Open the invoice to copy its address.');
    }
  };

  const invoicePath = active ? `/invoice/${active.shareToken}` : null;
  const price = billing?.price;

  return (
    <section className="q-card q-stack q-stack-sm q-dashboard-target" id="booking-payments" aria-labelledby="booking-payments-heading">
      <div className="q-row q-row-between">
        <h2 className="q-section-title" id="booking-payments-heading">Payments</h2>
        {totals && <span className="q-meta">{totals.status}</span>}
      </div>
      {billing === null && <p className="q-note q-note-bad">Booking payments unavailable</p>}
      {billing && !billing.confirmed && <p className="q-empty">Invoice available once the booking is confirmed</p>}
      {billing?.confirmed && !active && price?.source === 'unavailable' && <p className="q-empty">{price.problem}</p>}
      {billing?.confirmed && !active && price?.source !== 'unavailable' && panel !== 'issue' && (
        <div className="q-row q-row-between">
          <p className="q-empty">No active invoice</p>
          <button className="q-btn q-btn-primary q-btn-sm" type="button" onClick={() => open('issue')}>
            Issue invoice
          </button>
        </div>
      )}
      {billing?.confirmed && !active && price && price.source !== 'unavailable' && panel === 'issue' && (
        <form className="q-stack q-stack-sm" onSubmit={onIssue}>
          <InvoiceFields price={price} packageLines={billing.packages} disabled={working} />
          <div className="q-row q-row-sm">
            <button className="q-btn q-btn-primary q-btn-sm" type="submit" disabled={working}>
              {working ? 'Issuing invoice' : 'Issue invoice'}
            </button>
            <button className="q-btn q-btn-ghost q-btn-xs" type="button" disabled={working} onClick={() => open(null)}>Cancel</button>
          </div>
        </form>
      )}

      {active && totals && invoicePath && (
        <>
          <div className="q-stack q-stack-xs">
            <strong className="q-strong">Invoice {active.number} · {active.currency}</strong>
            {active.packageLines.length === 0 && <span className="q-meta q-invoice-text">{active.description}</span>}
          </div>
          {active.packageLines.length > 0 && <PackageLines lines={active.packageLines} currency={active.currency} />}
          <InvoiceAmounts invoice={active} packageLines={active.packageLines} />
          <div className="q-row q-row-sm">
            {totals.balance > 0 && panel !== 'record' && (
              <button className="q-btn q-btn-primary q-btn-sm" type="button" onClick={() => open('record')} disabled={working}>
                Record payment
              </button>
            )}
            <a className="q-btn q-btn-secondary q-btn-xs" href={invoicePath} target="_blank" rel="noopener noreferrer">
              View invoice
            </a>
            <button className="q-btn q-btn-ghost q-btn-xs" type="button" onClick={() => void copyLink(`${origin}${invoicePath}`)}>
              Copy invoice link
            </button>
          </div>
          {panel === 'record' && totals.balance > 0 && (
            <form className="q-stack q-stack-sm q-invoice-form" onSubmit={onRecord}>
              <PaymentFields currency={active.currency} maxMinor={totals.balance} today={today} disabled={working} />
              <div className="q-row q-row-sm">
                <button className="q-btn q-btn-primary q-btn-sm" type="submit" disabled={working}>
                  {working ? 'Recording payment' : 'Save payment'}
                </button>
                <button className="q-btn q-btn-ghost q-btn-xs" type="button" disabled={working} onClick={() => open(null)}>Cancel</button>
              </div>
            </form>
          )}
          <section className="q-stack q-stack-xs">
            <h3 className="q-reading">Payment history</h3>
            <InvoicePaymentHistory invoice={active} busy={working}
              onVoid={(id) => { open(null); setConfirm({ kind: 'payment', id }); }} />
          </section>
          {active.receivedMinor === 0 && confirm?.kind !== 'invoice' && (
            <div className="q-row">
              <button className="q-btn q-btn-ghost q-btn-xs" type="button" disabled={working}
                onClick={() => { open(null); setConfirm({ kind: 'invoice' }); }}>
                Void invoice
              </button>
            </div>
          )}
          {confirm && (
            <div className="q-stack q-stack-xs q-invoice-form">
              <p className="q-note">{confirm.kind === 'invoice'
                ? 'Void this invoice? The recorded invoice stays in the booking history.'
                : 'Void this entry? The balance will change. This action does not send a refund.'}</p>
              <div className="q-row q-row-sm">
                <button className="q-btn q-btn-secondary q-btn-xs" type="button" disabled={working}
                  onClick={() => confirm.kind === 'invoice'
                    ? run(() => voidInvoice(bookingId, active.id), 'Invoice voided.')
                    : run(() => voidPayment(bookingId, active.id, confirm.id), 'Payment entry voided.')}>
                  Confirm void
                </button>
                <button className="q-btn q-btn-ghost q-btn-xs" type="button" disabled={working} onClick={() => open(null)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {archived.length > 0 && (
        <details className="q-stack q-stack-xs">
          <summary className="q-meta">Voided invoices ({archived.length})</summary>
          <ul className="q-invoice-history">
            {archived.map((invoice) => (
              <li className="q-stack q-stack-xs q-invoice-form" key={invoice.id}>
                <strong className="q-strong">Invoice {invoice.number} · Voided</strong>
                {invoice.packageLines.length > 0
                  ? <PackageLines lines={invoice.packageLines} currency={invoice.currency} />
                  : <span className="q-meta q-invoice-text">{invoice.description}</span>}
                <InvoiceAmounts invoice={invoice} packageLines={invoice.packageLines} />
                <section className="q-stack q-stack-xs">
                  <h3 className="q-reading">Payment history</h3>
                  <InvoicePaymentHistory invoice={invoice} />
                </section>
              </li>
            ))}
          </ul>
        </details>
      )}
      {problem && <p className="q-note q-note-bad" role="alert">{problem}</p>}
      {notice && <p className="q-note" role="status">{notice}</p>}
    </section>
  );
}

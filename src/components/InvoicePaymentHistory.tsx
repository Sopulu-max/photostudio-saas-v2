import type { BookingInvoice } from '@/weave/payments/shape';
import { money } from '@/weave/store/shape';
import { PaymentDate } from './InvoiceReceipts';

export function InvoicePaymentHistory({ invoice, onVoid, busy, invoicePath }: {
  invoice: BookingInvoice;
  onVoid?: (id: string) => void;
  busy?: boolean;
  invoicePath?: string;
}) {
  if (invoice.payments.length === 0) return <p className="q-empty">No payments recorded</p>;

  return (
    <ul className="q-invoice-history">
      {invoice.payments.map((payment) => {
        const amount = money(payment.amountMinor, invoice.currency);
        return (
          <li className="q-invoice-payment" key={payment.id}>
            <span className="q-stack q-stack-xs">
              <strong className="q-num">{amount}</strong>
              <span className="q-meta">
                <PaymentDate date={payment.receivedOn} />
                {payment.voidedAt && ' · Voided'}
              </span>
              {payment.reference && <span className="q-meta q-invoice-text">{payment.reference}</span>}
            </span>
            {payment.voidedAt === null && onVoid && (
              <button className="q-btn q-btn-ghost q-btn-xs" type="button" disabled={busy}
                onClick={() => onVoid(payment.id)} aria-label={`Void payment of ${amount}`}>
                Void entry
              </button>
            )}
            {payment.voidedAt === null && invoicePath && (
              <a className="q-auth-link" href={`${invoicePath}/receipts/${payment.id}`}
                aria-label={`View receipt for ${amount} received ${payment.receivedOn}`}>
                View receipt
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

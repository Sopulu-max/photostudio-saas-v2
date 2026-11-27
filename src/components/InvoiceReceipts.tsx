import type { ReceiptPayment } from '@/weave/payments/shape';
import { money } from '@/weave/store/shape';

const receivedDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

export function PaymentDate({ date }: { date: string }) {
  return <time dateTime={date}>{receivedDate.format(new Date(`${date}T00:00:00Z`))}</time>;
}

export function InvoiceReceipts({ payments, currency, invoicePath }: {
  payments: ReceiptPayment[];
  currency: string;
  invoicePath: string;
}) {
  if (payments.length === 0) return <p className="q-empty">No payments recorded</p>;

  return (
    <ul className="q-invoice-history">
      {payments.map((payment) => {
        const amount = money(payment.amountMinor, currency);
        return (
          <li className="q-invoice-payment" key={payment.id}>
            <span className="q-stack q-stack-xs">
              <strong className="q-num">{amount}</strong>
              <span className="q-meta"><PaymentDate date={payment.receivedOn} /></span>
            </span>
            <a className="q-auth-link" href={`${invoicePath}/receipts/${payment.id}`}
              aria-label={`View receipt for ${amount} received ${receivedDate.format(new Date(`${payment.receivedOn}T00:00:00Z`))}`}>
              View receipt
            </a>
          </li>
        );
      })}
    </ul>
  );
}

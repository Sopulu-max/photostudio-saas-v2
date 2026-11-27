import { invoiceBalance, type InvoicePackageLine, type InvoiceTerms } from '@/weave/payments/shape';
import { money } from '@/weave/store/shape';

export function InvoiceAmounts({ invoice, packageLines = [] }: {
  invoice: Pick<InvoiceTerms, 'totalMinor' | 'depositMinor' | 'receivedMinor' | 'voidedAt' | 'currency'>;
  packageLines?: InvoicePackageLine[];
}) {
  const { balance, depositDue } = invoiceBalance(invoice);
  const format = (minor: number) => money(minor, invoice.currency);
  const pricedSubtotal = packageLines.reduce((sum, line) => sum + (line.unitMinor ?? 0) * line.quantity, 0);
  const quotedRemainder = invoice.totalMinor - pricedSubtotal;

  return (
    <dl className="q-invoice-amounts">
      {pricedSubtotal > 0 && quotedRemainder > 0 && packageLines.some((line) => line.unitMinor === null) && (
        <>
          <div className="q-invoice-line">
            <dt className="q-meta">Priced packages</dt>
            <dd className="q-num">{format(pricedSubtotal)}</dd>
          </div>
          <div className="q-invoice-line">
            <dt className="q-meta">Quoted remainder</dt>
            <dd className="q-num">{format(quotedRemainder)}</dd>
          </div>
        </>
      )}
      <div className="q-invoice-line">
        <dt className="q-meta">Invoice total</dt>
        <dd className="q-num">{format(invoice.totalMinor)}</dd>
      </div>
      {invoice.depositMinor !== null && (
        <div className="q-invoice-line">
          <dt className="q-meta">{depositDue === invoice.depositMinor ? 'Deposit due' : 'Agreed deposit'}</dt>
          <dd className="q-num">{format(invoice.depositMinor)}</dd>
        </div>
      )}
      <div className="q-invoice-line">
        <dt className="q-meta">Payments received</dt>
        <dd className="q-num">{format(invoice.receivedMinor)}</dd>
      </div>
      {depositDue !== null && depositDue > 0 && depositDue !== invoice.depositMinor && (
        <div className="q-invoice-line">
          <dt className="q-meta">Deposit still due</dt>
          <dd className="q-num">{format(depositDue)}</dd>
        </div>
      )}
      {invoice.voidedAt === null && (
        <div className="q-invoice-line q-invoice-balance">
          <dt className="q-strong">Balance due</dt>
          <dd className="q-num">{format(balance)}</dd>
        </div>
      )}
    </dl>
  );
}

'use client';

import { useState } from 'react';
import { InvoiceAmounts } from './InvoiceAmounts';
import { PackageLines } from './PackageLines';
import { amountInMinorUnits, isInvoiceCurrency, MAX_INVOICE_MINOR, type InvoicePackageLine, type InvoicePrice } from '@/weave/payments/shape';

export function InvoiceFields({ price, packageLines, disabled, payment }: {
  price: Exclude<InvoicePrice, { source: 'unavailable' }>;
  packageLines: InvoicePackageLine[];
  disabled: boolean;
  payment?: { today: string; enabled: boolean; onChange: (enabled: boolean) => void };
}) {
  const [agreedTotal, setAgreedTotal] = useState('');
  const [currencyInput, setCurrencyInput] = useState<string | null>(null);
  const [deposit, setDeposit] = useState('');
  const [received, setReceived] = useState('');

  const fixedCurrency = price.source === 'packages' || price.fixedCurrency;
  const currencyValue = fixedCurrency ? price.currency : currencyInput ?? price.currency;
  const currency = currencyValue.trim().toUpperCase();
  const validCurrency = isInvoiceCurrency(currency);
  const totalMinor = price.source === 'packages' ? price.totalMinor : amountInMinorUnits(agreedTotal);
  const minimumMinor = price.source === 'quote' ? Math.max(1, price.pricedSubtotal) : 1;
  const depositMinor = amountInMinorUnits(deposit);
  const receivedMinor = payment?.enabled && received ? amountInMinorUnits(received) : 0;
  const validTotal = validCurrency && totalMinor !== null && totalMinor >= minimumMinor && totalMinor <= MAX_INVOICE_MINOR;
  const validPayments = totalMinor !== null && (deposit === '' || (depositMinor !== null && depositMinor > 0 && depositMinor <= totalMinor))
    && receivedMinor !== null && receivedMinor <= totalMinor;

  return (
    <>
      <div className="q-invoice-fields">
        {price.source === 'packages' ? (
          <>
            <input type="hidden" name="total" value={(price.totalMinor / 100).toFixed(2)} />
            <input type="hidden" name="currency" value={price.currency} />
          </>
        ) : (
          <>
            <label className="q-field">
              <span className="q-label">Agreed total</span>
              <input className="q-input" type="number" name="total"
                min={minimumMinor / 100} max={MAX_INVOICE_MINOR / 100} step="0.01"
                value={agreedTotal} onChange={(event) => setAgreedTotal(event.target.value)} required disabled={disabled} />
            </label>
            <label className="q-field">
              <span className="q-label">Currency code</span>
              <input className="q-input" name="currency" value={currencyValue} readOnly={fixedCurrency}
                onChange={(event) => setCurrencyInput(event.target.value)} required
                minLength={3} maxLength={3} pattern="[A-Za-z]{3}" disabled={disabled} />
            </label>
          </>
        )}
        <label className="q-field">
          <span className="q-label">Deposit amount (optional)</span>
          <input className="q-input" type="number" name="deposit" min="0.01"
            max={(validTotal ? totalMinor : MAX_INVOICE_MINOR) / 100} step="0.01"
            value={deposit} onChange={(event) => setDeposit(event.target.value)} disabled={disabled} />
        </label>
      </div>
      {payment && (
        <>
          <label className="q-row q-row-sm">
            <input type="checkbox" name="recordPayment" checked={payment.enabled} disabled={disabled}
              onChange={(event) => { setReceived(''); payment.onChange(event.target.checked); }} />
            <span className="q-text-body">Record payment already received</span>
          </label>
          {payment.enabled && (
            <PaymentFields today={payment.today} disabled={disabled}
              maxMinor={validTotal ? totalMinor : MAX_INVOICE_MINOR}
              currency={validCurrency ? currency : undefined} amount={{ value: received, onChange: setReceived }} />
          )}
        </>
      )}
      <section className="q-stack q-stack-xs q-invoice-form" aria-label="Invoice breakdown">
        <h3 className="q-reading">Invoice breakdown</h3>
        {packageLines.length > 0 && <PackageLines lines={packageLines} currency={validCurrency ? currency : undefined} />}
        <div className="q-stack q-stack-xs" aria-live="polite">
          {validTotal && validPayments ? (
            <InvoiceAmounts packageLines={packageLines}
              invoice={{ totalMinor, depositMinor, receivedMinor, currency, voidedAt: null }} />
          ) : (
            <p className="q-note">{validTotal ? 'Review the deposit and payment amounts.' : 'Invoice total pending.'}</p>
          )}
        </div>
      </section>
    </>
  );
}

export function PaymentFields({ currency, maxMinor, today, disabled, amount }: {
  currency?: string;
  maxMinor: number;
  today: string;
  disabled: boolean;
  amount?: { value: string; onChange: (value: string) => void };
}) {
  return (
    <>
      <div className="q-invoice-fields">
        <label className="q-field">
          <span className="q-label">Amount received{currency ? ` (${currency})` : ''}</span>
          <input className="q-input" type="number" name="amount" min="0.01" max={maxMinor / 100}
            step="0.01" value={amount?.value} onChange={amount && ((event) => amount.onChange(event.target.value))}
            required disabled={disabled} />
        </label>
        <label className="q-field">
          <span className="q-label">Received date</span>
          <input className="q-input" type="date" name="receivedOn" required max={today} defaultValue={today} disabled={disabled} />
        </label>
      </div>
      <label className="q-field">
        <span className="q-label">Payment reference (optional)</span>
        <input className="q-input" name="reference" maxLength={160} disabled={disabled} />
      </label>
    </>
  );
}

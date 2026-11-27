import { MAX_INVOICE_MINOR, amountInMinorUnits, isInvoiceCurrency } from './shape';

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function invoiceFrom(form: FormData) {
  const currency = field(form, 'currency').trim().toUpperCase();
  const total = amountInMinorUnits(field(form, 'total'));
  const depositText = field(form, 'deposit').trim();
  const deposit = depositText ? amountInMinorUnits(depositText) : null;
  const instructions = field(form, 'instructions');

  if (!isInvoiceCurrency(currency)) {
    throw new Error('Enter a valid two-decimal currency code, such as NGN.');
  }
  if (!total || total > MAX_INVOICE_MINOR) throw new Error('Enter a valid invoice total.');
  if (depositText && (!deposit || deposit > total)) {
    throw new Error('The deposit must be greater than zero and no more than the invoice total.');
  }
  if (instructions.length > 2000) throw new Error('Payment instructions must be 2,000 characters or fewer.');

  return {
    currency, total_minor: total, deposit_minor: deposit,
    instructions: instructions.trim() ? instructions : null,
  };
}

export function paymentFrom(form: FormData) {
  const amount = amountInMinorUnits(field(form, 'amount'));
  const received = field(form, 'receivedOn');
  const reference = field(form, 'reference');
  if (!amount || amount > MAX_INVOICE_MINOR) throw new Error('Enter a valid payment amount.');
  const day = new Date(`${received}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(received) || !Number.isFinite(day.valueOf())
    || day.toISOString().slice(0, 10) !== received || received > new Date().toLocaleDateString('en-CA')) {
    throw new Error('Enter a valid received date that is today or earlier.');
  }
  if (reference.length > 160) throw new Error('Payment reference must be 160 characters or fewer.');

  return {
    amount_minor: amount, received_on: received, reference: reference.trim() ? reference : null,
  };
}

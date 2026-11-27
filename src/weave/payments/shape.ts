/** Invoice and payment amounts use the studio's two-decimal minor units. */
import type { BookingPackage } from '@/weave/bookings/shape';

export const MAX_INVOICE_MINOR = 99_999_999_999;

export type InvoicePayment = {
  id: string;
  amountMinor: number;
  receivedOn: string;
  reference: string | null;
  voidedAt: string | null;
};

export type InvoiceTerms = {
  number: number;
  clientName: string | null;
  description: string;
  currency: string;
  totalMinor: number;
  depositMinor: number | null;
  instructions: string | null;
  issuedAt: string;
  voidedAt: string | null;
  receivedMinor: number;
};

export type InvoicePackageLine = Pick<BookingPackage, 'name' | 'quantity' | 'unitMinor'>;

export type BookingInvoice = InvoiceTerms & {
  id: string;
  shareToken: string;
  payments: InvoicePayment[];
  packageLines: InvoicePackageLine[];
};

export type InvoiceSummary = Omit<InvoiceTerms, 'instructions'> & {
  bookingId: string;
};

export type ReceiptPayment = Pick<InvoicePayment, 'id' | 'amountMinor' | 'receivedOn'>;

export type ClientInvoice = InvoiceSummary & {
  shareToken: string;
  payments: ReceiptPayment[];
};

export type SharedInvoice = InvoiceTerms & {
  studioName: string;
  payments: ReceiptPayment[];
  packageLines: InvoicePackageLine[];
};

export type InvoicePrice =
  | { source: 'packages'; currency: string; totalMinor: number }
  | { source: 'quote'; currency: string; pricedSubtotal: number; fixedCurrency: boolean }
  | { source: 'unavailable'; problem: string };

export type BookingBilling = {
  confirmed: boolean;
  packages: BookingPackage[];
  price: InvoicePrice;
  invoices: BookingInvoice[];
};

export function amountInMinorUnits(value: string): number | null {
  const match = /^(\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function isInvoiceCurrency(currency: string) {
  return /^[A-Z]{3}$/.test(currency)
    && Intl.supportedValuesOf('currency').includes(currency)
    && new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits === 2;
}

export function priceForInvoice(packages: Pick<BookingPackage, 'unitMinor' | 'quantity' | 'currency'>[]): InvoicePrice {
  const priced = packages.filter((pack) => pack.unitMinor !== null);
  const currency = (priced[0]?.currency ?? packages[0]?.currency ?? 'NGN').trim().toUpperCase();
  if (priced.some((pack) => pack.currency.trim().toUpperCase() !== currency)) {
    return { source: 'unavailable', problem: 'An invoice requires all priced packages to use the same currency.' };
  }
  const total = priced.reduce((sum, pack) => sum + (pack.unitMinor ?? 0) * pack.quantity, 0);
  if (total > MAX_INVOICE_MINOR || (priced.length > 0 && !isInvoiceCurrency(currency))) {
    return { source: 'unavailable', problem: 'Package total unavailable for invoicing.' };
  }
  if (priced.length > 0 && priced.length === packages.length) {
    return total > 0
      ? { source: 'packages', currency, totalMinor: total }
      : { source: 'unavailable', problem: 'No payment due for these packages.' };
  }
  return {
    source: 'quote', currency: isInvoiceCurrency(currency) ? currency : 'NGN',
    pricedSubtotal: total, fixedCurrency: priced.length > 0,
  };
}

export function invoiceBalance(invoice: Pick<InvoiceTerms, 'totalMinor' | 'depositMinor' | 'receivedMinor' | 'voidedAt'>) {
  if (invoice.voidedAt) return { balance: 0, depositDue: null, status: 'Voided' };
  const balance = invoice.totalMinor - invoice.receivedMinor;
  const depositDue = invoice.depositMinor === null
    ? null : Math.max(0, invoice.depositMinor - invoice.receivedMinor);
  const status = balance === 0 ? 'Paid in full'
    : depositDue ? 'Deposit outstanding'
      : invoice.receivedMinor > 0 ? 'Balance outstanding' : 'Unpaid';
  return { balance, depositDue, status };
}

export const INVOICE_TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

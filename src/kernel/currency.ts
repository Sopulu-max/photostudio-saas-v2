/**
 * Currency — a studio bills in one, so it lives on the organization and every
 * module reads it from here rather than defaulting to 'USD' on its own.
 */

export const CURRENCIES = [
  { code: 'NGN', symbol: '₦',   label: 'Nigerian Naira' },
  { code: 'USD', symbol: '$',   label: 'US Dollar' },
  { code: 'GBP', symbol: '£',   label: 'British Pound' },
  { code: 'EUR', symbol: '€',   label: 'Euro' },
  { code: 'GHS', symbol: '₵',   label: 'Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R',   label: 'South African Rand' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$',  label: 'Australian Dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'INR', symbol: '₹',   label: 'Indian Rupee' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function currencySymbol(code?: string | null) {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '';
}

/** Format an amount in the studio's currency. Digits stay tabular-friendly. */
export function formatMoney(amount: number | null | undefined, code?: string | null) {
  const n = Number(amount ?? 0);
  const sym = currencySymbol(code);
  const body = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return sym ? `${sym}${body}` : `${body} ${code ?? ''}`.trim();
}

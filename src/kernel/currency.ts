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

/** Human duration: 90 → "1h 30m". Kept here as the shared formatting home. */
export function formatDuration(minutes?: number | null) {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Common lengths a studio picks from, plus "not timed". */
export const DURATION_CHOICES = [
  { minutes: 0, label: 'Not timed' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 45, label: '45 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1½ hours' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 360, label: '6 hours' },
  { minutes: 480, label: '8 hours (full day)' },
  { minutes: 600, label: '10 hours' },
] as const;

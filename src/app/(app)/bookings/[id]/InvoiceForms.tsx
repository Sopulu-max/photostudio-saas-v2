'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoiceForBooking } from '@/modules/finances/interface';
import { toast, readableError } from '@/components/Toast';
import { formatMoney } from '@/kernel/currency';

/**
 * Bill this booking for what's on it.
 *
 * There is nothing to type: the lines, their prices and what each client is
 * getting are already on the booking, so the invoice is generated from them
 * and opened as a draft to check. Typing an amount into a box was the old way,
 * and it is how an invoice ends up disagreeing with what was sold.
 */
export function GenerateInvoiceButton({
  bookingId,
  canBill,
  leftToInvoice,
  discounted,
  currency,
}: {
  bookingId: string;
  /** Something on the booking carries a price. Unpriced work has no amount to demand. */
  canBill: boolean;
  /**
   * What is neither billed nor given away. Zero means this cannot succeed.
   *
   * The refusal lives in Finances, which owns the rule, and the operator was
   * never seeing it: Next redacts a server action's error to a digest, so the
   * message this raised arrived as nothing and the button fell back to "Could
   * not start that invoice" - the app knowing exactly what was wrong and
   * saying none of it. A control that cannot succeed is not offered; the fact
   * is stated where the control was.
   */
  leftToInvoice: number;
  /** Taken off the price, which is the half of the sum that explains the rest. */
  discounted: number;
  currency: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!canBill) return null;

  if (leftToInvoice <= 0) {
    return (
      <span className="q-meta">
        {discounted > 0
          ? `Fully accounted for — ${formatMoney(discounted, currency)} discounted.`
          : 'Fully invoiced.'}
      </span>
    );
  }

  return (
    <button
      className="q-btn q-btn-primary q-btn-sm"
      aria-busy={isPending}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const { invoiceId } = await createInvoiceForBooking({ bookingId });
            router.push(`/finances/invoices/${invoiceId}`);
          } catch (e: any) {
            toast.bad(readableError(e, 'Could not start that invoice.'));
          }
        })
      }
    >
      {isPending ? 'Building…' : 'Invoice this booking'}
    </button>
  );
}

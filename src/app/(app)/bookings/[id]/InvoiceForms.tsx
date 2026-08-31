'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoiceForBooking } from '@/modules/finances/interface';
import { toast, readableError } from '@/components/Toast';

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
  hasLines,
}: {
  bookingId: string;
  hasLines: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!hasLines) return null;

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

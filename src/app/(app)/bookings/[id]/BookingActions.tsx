'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContractForBooking } from '@/modules/bookings/interface';
import { toast, readableError } from '@/components/Toast';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { toast.bad(readableError(e, 'Something went wrong.')); }
    });
  return { isPending, run };
}

export function CreateContractButton({ bookingId, label = 'Create a contract' }: { bookingId: string; label?: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => run(() => createContractForBooking(bookingId))}>
      {isPending ? 'Creating...' : label}
    </button>
  );
}

'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContractForBooking, restoreWorkForBooking } from '@/modules/bookings/interface';
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

/**
 * Fill an empty work board from what the booking's packages call for.
 *
 * Only ever offered when the board IS empty — a line already carrying work has
 * been worked on, and topping it up would resurrect the steps somebody
 * deliberately dropped. The operation refuses those lines too, so pressing this
 * twice is harmless.
 */
export function RestoreWorkButton({ bookingId }: { bookingId: string }) {
  const { isPending, run } = useAction();
  return (
    <button
      className="q-btn q-btn-secondary q-btn-sm"
      disabled={isPending}
      style={{ alignSelf: 'flex-start' }}
      onClick={() => run(() => restoreWorkForBooking(bookingId))}
    >
      {isPending ? 'Bringing it in…' : 'Bring in the work from its packages'}
    </button>
  );
}

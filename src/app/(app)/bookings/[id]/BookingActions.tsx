'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContractForBooking, startWorkForLine, extractPackageFromEnquiry } from '@/modules/bookings/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run };
}

export function ExtractPackageButton({ bookingId, label = 'Extract to package' }: { bookingId: string; label?: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" style={{ marginTop: '12px' }} disabled={isPending} onClick={() => run(() => extractPackageFromEnquiry(bookingId))}>
      {isPending ? 'Extracting…' : label}
    </button>
  );
}

export function CreateContractButton({ bookingId, label = 'Create a contract' }: { bookingId: string; label?: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => run(() => createContractForBooking(bookingId))}>
      {isPending ? 'Creating…' : label}
    </button>
  );
}

export function StartWorkButton({ bookingId, lineId }: { bookingId: string; lineId: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }} disabled={isPending} onClick={() => run(() => startWorkForLine({ bookingId, lineId }))}>
      {isPending ? 'Starting…' : 'Start work'}
    </button>
  );
}

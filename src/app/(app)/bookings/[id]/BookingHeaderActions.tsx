'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast, readableError } from '@/components/Toast';
import {
  setBookingStage,
  reviewCascadeForCancel,
  deleteBooking,
} from '@/modules/bookings/interface';

type Stage = { id: string; name: string; kind: string };

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { toast.bad(readableError(e, 'Something went wrong.')); }
    });
  return { isPending, run, router };
}

/** Move the booking through the studio's own stages. */
export function StagePicker({ bookingId, stages, currentStageId }: { bookingId: string; stages: Stage[]; currentStageId: string }) {
  const { isPending, run } = useAction();
  const [pendingCancel, setPendingCancel] = useState<{ stage: Stage; effects: any } | null>(null);
  /*
   * WHAT WAS CHOSEN, HELD UNTIL THE PAGE CATCHES UP.
   *
   * The select was driven by the server's value alone, so the moment a stage
   * was picked it snapped back to the old one and stayed there until the
   * action returned and the page re-rendered - on a slow connection, minutes
   * of "nothing happened" while the move had in fact been written. The
   * choice is shown at once and only given up if the move fails.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = chosen ?? currentStageId;
  if (chosen && chosen === currentStageId) setChosen(null);

  const move = (stage: Stage) => {
    // Moving to a cancelled stage: show what else is affected first. Nothing is
    // acted on automatically — the studio decides about contracts and money.
    if (stage.kind === 'cancelled') {
      run(async () => {
        const effects = await reviewCascadeForCancel(bookingId);
        setPendingCancel({ stage, effects });
      });
      return;
    }
    setChosen(stage.id);
    run(() => setBookingStage({ bookingId, stageId: stage.id }).catch((e) => { setChosen(null); throw e; }));
  };

  if (pendingCancel) {
    const e = pendingCancel.effects;
    const nothing = !e.activeContracts && !e.unpaidCount && !e.openTasks && !e.sharedDeliveries;
    return (
      <div className="q-note q-note-warn q-stack q-stack-sm">
        <strong>Move to “{pendingCancel.stage.name}”?</strong>
        {nothing ? (
          <span className="q-meta">Nothing else is attached to this booking.</span>
        ) : (
          <ul className="q-stack q-stack-sm" style={{ margin: 0, paddingLeft: '18px' }}>
            {e.activeContracts > 0 && <li className="q-meta-plain">{e.activeContracts} active contract{e.activeContracts > 1 ? 's' : ''} — left as-is</li>}
            {e.unpaidCount > 0 && <li className="q-meta-plain">{e.unpaidCount} unpaid invoice{e.unpaidCount > 1 ? 's' : ''} ({e.unpaidTotal.toLocaleString()}) — still owed</li>}
            {e.openTasks > 0 && <li className="q-meta-plain">{e.openTasks} unfinished task{e.openTasks > 1 ? 's' : ''}</li>}
            {e.sharedDeliveries > 0 && <li className="q-meta-plain">{e.sharedDeliveries} shared delivery link{e.sharedDeliveries > 1 ? 's' : ''} — still live</li>}
          </ul>
        )}
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending}
            onClick={() => { setChosen(pendingCancel.stage.id); run(() => setBookingStage({ bookingId, stageId: pendingCancel.stage.id }).catch((e) => { setChosen(null); throw e; }), () => setPendingCancel(null)); }}>
            Move it
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setPendingCancel(null)}>Keep as is</button>
        </div>
      </div>
    );
  }

  return (
    <span className="q-row q-row-sm">
      <select
        className="q-select"
        value={shown}
        disabled={isPending}
        aria-busy={isPending}
        onChange={(e) => {
          const stage = stages.find((s) => s.id === e.target.value);
          if (stage && stage.id !== currentStageId) move(stage);
        }}
        style={{ minWidth: '11rem' }}
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {isPending && <span className="q-meta-sm">Moving…</span>}
    </span>
  );
}

/**
 * Delete, for genuine mistakes. Lives on the edit page rather than the detail
 * page: it changes the record rather than moving the work along, and it is the
 * one action here with nothing to undo it. Renaming is the edit form's title
 * field now, so this no longer carries it.
 */
export function DeleteBookingButton({ bookingId }: { bookingId: string }) {
  const { isPending, run, router } = useAction();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-stack q-stack-sm">
        <strong>Delete this booking for good?</strong>
        <span className="q-meta-plain">Everything on it — packages, charges, work, contracts, invoices and deliveries — goes too. If the job simply isn’t happening, move it to a cancelled stage instead — that keeps the record.</span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending}
            onClick={() => run(async () => { await deleteBooking(bookingId); router.push('/bookings'); })}>
            Delete
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      </div>
    );
  }

  return (
    <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(true)}>
      Delete this booking
    </button>
  );
}

'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setBookingStage,
  reviewCascadeForCancel,
  renameBooking,
  deleteBooking,
} from '@/modules/bookings/interface';

type Stage = { id: string; name: string; kind: string };

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run, router };
}

/** Move the booking through the studio's own stages. */
export function StagePicker({ bookingId, stages, currentStageId }: { bookingId: string; stages: Stage[]; currentStageId: string }) {
  const { isPending, run } = useAction();
  const [pendingCancel, setPendingCancel] = useState<{ stage: Stage; effects: any } | null>(null);

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
    run(() => setBookingStage({ bookingId, stageId: stage.id }));
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
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(() => setBookingStage({ bookingId, stageId: pendingCancel.stage.id }), () => setPendingCancel(null))}>
            Move it
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setPendingCancel(null)}>Keep as is</button>
        </div>
      </div>
    );
  }

  return (
    <select
      className="q-select"
      value={currentStageId}
      disabled={isPending}
      onChange={(e) => {
        const stage = stages.find((s) => s.id === e.target.value);
        if (stage && stage.id !== currentStageId) move(stage);
      }}
      style={{ minWidth: '11rem' }}
    >
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

/** Rename in place, and delete for genuine mistakes. */
export function BookingTitleActions({ bookingId, title }: { bookingId: string; title: string }) {
  const { isPending, run, router } = useAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <div className="q-row">
        <input autoFocus className="q-input" value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setValue(title); } }}
          style={{ minWidth: '18rem' }} />
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
          onClick={() => value.trim() && run(() => renameBooking({ bookingId, title: value }), () => setEditing(false))}>
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setValue(title); }}>Cancel</button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-stack q-stack-sm">
        <strong>Delete this booking for good?</strong>
        <span className="q-meta-plain">Its lines, work, contracts, invoices and deliveries go with it. If the job simply isn’t happening, move it to a cancelled stage instead — that keeps the record.</span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(async () => { await deleteBooking(bookingId); router.push('/bookings'); })}>
            Delete
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-row">
      <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Rename</button>
      <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setConfirming(true)}>Delete</button>
    </div>
  );
}

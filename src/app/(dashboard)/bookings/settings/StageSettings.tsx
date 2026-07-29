'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStage, renameStage, deleteStage, setStageColor } from '@/modules/bookings/interface';
import { stageBadgeClass, stageColor, STAGE_COLORS } from '@/components/stageBadge';

type Stage = { id: string; name: string; kind: string; color: string | null; position: number; is_default: boolean };

const KINDS = [
  { key: 'enquiry',   label: 'Enquiry',   help: 'Someone’s interested, nothing committed' },
  { key: 'booked',    label: 'Booked',    help: 'It’s happening — it’s in the diary' },
  { key: 'completed', label: 'Completed', help: 'Done and handed over' },
  { key: 'cancelled', label: 'Cancelled', help: 'It didn’t happen' },
];

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run };
}

function StageRow({ stage }: { stage: Stage }) {
  const { isPending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);

  return (
    <div className="q-tile q-row q-row-between">
      {editing ? (
        <div className="q-stack q-stack-sm q-fill">
          <div className="q-row">
            <input autoFocus className="q-input" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
            <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
              onClick={() => name.trim() && run(() => renameStage({ stageId: stage.id, name }), () => setEditing(false))}>Save</button>
            <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setName(stage.name); }}>Cancel</button>
          </div>
          <div className="q-row">
            <span className="q-meta-sm">Colour</span>
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                title={c}
                disabled={isPending}
                className={`q-swatch q-swatch-${c} ${stageColor(stage) === c ? 'q-swatch-on' : ''}`}
                onClick={() => run(() => setStageColor({ stageId: stage.id, color: c }))}
              />
            ))}
            {stage.color && (
              <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                onClick={() => run(() => setStageColor({ stageId: stage.id, color: null }))}>
                Reset
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="q-row">
            <span className={`q-badge ${stageBadgeClass(stage)}`}>{stage.name}</span>
            <span className="q-meta-sm">counts as {stage.kind}</span>
            {stage.is_default && <span className="q-meta-sm">· new bookings start here</span>}
          </div>
          <div className="q-row">
            <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Rename</button>
            <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
              onClick={() => run(() => deleteStage(stage.id))}>Remove</button>
          </div>
        </>
      )}
    </div>
  );
}

export function StageSettings({ stages }: { stages: Stage[] }) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('booked');

  return (
    <div className="q-stack q-stack-md">
      <div className="q-stack q-stack-sm">
        {stages.map((s) => <StageRow key={s.id} stage={s} />)}
      </div>

      {open ? (
        <div className="q-row">
          <input autoFocus className="q-input" placeholder="e.g. Shoot day" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
          <select className="q-select" value={kind} onChange={(e) => setKind(e.target.value)} style={{ minWidth: '11rem' }}>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <button className="q-btn q-btn-primary" disabled={isPending}
            onClick={() => name.trim() && run(() => createStage({ name: name.trim(), kind: kind as any }), () => { setName(''); setOpen(false); })}>
            Add stage
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>+ New stage</button>
      )}

      <div className="q-panel q-stack q-stack-sm">
        <strong className="q-meta-plain">What the four kinds mean</strong>
        {KINDS.map((k) => (
          <div key={k.key} className="q-row">
            <span className={`q-badge ${stageBadgeClass({ kind: k.key })}`}>{k.label}</span>
            <span className="q-meta">{k.help}</span>
          </div>
        ))}
        <span className="q-meta-sm">
          Name your stages whatever you like — the kind is how the calendar, Command Center and reports understand them.
          You can have several stages of the same kind (“Booked in”, “Shoot day”, “In edit” are all Booked).
        </span>
      </div>
    </div>
  );
}

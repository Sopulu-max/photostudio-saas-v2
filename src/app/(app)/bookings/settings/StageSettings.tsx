'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStage, deleteStage, updateStage, setDefaultStage } from '@/modules/bookings/interface';
import { stageBadgeClass, stageColor, STAGE_COLORS } from '@/components/stageBadge';
import { toast, readableError } from '@/components/Toast';

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
      try {
        await fn();
        after?.();
        toast.ok('The stages are saved.');
        router.refresh();
      }
      catch (e: any) { toast.bad(readableError(e, 'Something went wrong.')); }
    });
  return { isPending, run };
}

function StageRow({ stage }: { stage: Stage }) {
  const { isPending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  // Colour is chosen locally so trying one is instant — only Save goes to the
  // server, and it carries the name with it.
  const [color, setColor] = useState<string | null>(stage.color);

  const reset = () => { setName(stage.name); setColor(stage.color); setEditing(false); };
  const preview = { kind: stage.kind, color };
  const dirty = name.trim() !== stage.name || color !== stage.color;

  return (
    <div className="q-tile q-row q-row-between">
      {editing ? (
        <div className="q-stack q-stack-sm q-fill">
          <div className="q-row">
            <input autoFocus className="q-input" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
            <span className={`q-badge ${stageBadgeClass(preview)}`}>{name.trim() || stage.name}</span>
            <span className="q-spacer" />
            <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending || !dirty}
              onClick={() => name.trim() && run(
                () => updateStage({ stageId: stage.id, name, color }),
                () => setEditing(false))}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="q-btn q-btn-secondary q-btn-sm" onClick={reset}>Cancel</button>
          </div>
          <div className="q-row">
            <span className="q-meta-sm">Colour</span>
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                title={c}
                className={`q-swatch q-swatch-${c} ${stageColor(preview) === c ? 'q-swatch-on' : ''}`}
                onClick={() => setColor(c)}
              />
            ))}
            {color && (
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setColor(null)}>
                Use default
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
            {!stage.is_default && (
              <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                onClick={() => run(() => setDefaultStage(stage.id))}>Start here</button>
            )}
            <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Edit</button>
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
          <button className="q-btn q-btn-primary" aria-busy={isPending} disabled={isPending}
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

'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBlueprint, deleteBlueprint } from '@/modules/services/interface';

/**
 * Blueprints were write-once — stages were frozen the moment you created one.
 * Edited locally, committed with Save.
 */
export function BlueprintRow({ blueprint }: { blueprint: { id: string; name: string; stages: any[] } }) {
  const stageNames = (blueprint.stages || []).map((s: any) => s.name).join(', ');
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(blueprint.name);
  const [stages, setStages] = useState(stageNames);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  const dirty = name.trim() !== blueprint.name || stages !== stageNames;

  if (editing) {
    return (
      <div className="q-tile q-stack q-stack-sm">
        <div className="q-row">
          <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Blueprint name" style={{ minWidth: '12rem' }} />
          <span className="q-spacer" />
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending || !dirty}
            onClick={() => run(
              () => updateBlueprint({
                blueprintId: blueprint.id,
                name,
                stages: stages.split(',').map((s) => ({ name: s.trim() })).filter((s) => s.name),
              }),
              () => setEditing(false))}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm"
            onClick={() => { setEditing(false); setName(blueprint.name); setStages(stageNames); }}>Cancel</button>
        </div>
        <input className="q-input" value={stages} onChange={(e) => setStages(e.target.value)} placeholder="stages, comma separated" />
        <span className="q-meta-sm">Order follows what you type. Work already started keeps the stages it was given.</span>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="q-tile q-note q-note-bad q-stack q-stack-sm">
        <span className="q-meta-plain">
          Remove &ldquo;{blueprint.name}&rdquo;? Services using it fall back to starting work from a single stage. Work already underway is untouched.
        </span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(() => deleteBlueprint(blueprint.id))}>Remove</button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep</button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-tile q-row q-row-between">
      <div>
        <strong className="q-strong">{blueprint.name}</strong>
        <div className="q-row" style={{ marginTop: '5px' }}>
          {(blueprint.stages || []).map((s: any, i: number) => (
            <span key={i} className="q-badge q-badge-neutral">{s.name}</span>
          ))}
        </div>
      </div>
      <div className="q-row">
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Edit</button>
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setConfirming(true)}>Remove</button>
      </div>
    </div>
  );
}

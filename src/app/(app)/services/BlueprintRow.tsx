'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBlueprint, deleteBlueprint } from '@/modules/services/interface';

type Stage = { name: string; roleName: string; frontStage: boolean };
type StoredStage = { name: string; roleName?: string | null; front_stage?: boolean | null };

const toEditable = (stages: StoredStage[]): Stage[] =>
  (stages || []).map((s) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true }));

/**
 * Blueprints were write-once — stages were frozen the moment you created one.
 * Edited locally, committed with Save.
 */
export function BlueprintRow({ blueprint, roleOptions }: { blueprint: { id: string; name: string; stages: StoredStage[] }; roleOptions: string[] }) {
  const initialStages = toEditable(blueprint.stages);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(blueprint.name);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  const dirty = name.trim() !== blueprint.name || JSON.stringify(stages) !== JSON.stringify(initialStages);

  const patchStage = (i: number, updates: Partial<Stage>) =>
    setStages((s) => s.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const addStage = () => setStages((s) => [...s, { name: '', roleName: '', frontStage: true }]);
  const removeStage = (i: number) => setStages((s) => s.filter((_, idx) => idx !== i));

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
                stages: stages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
              }),
              () => setEditing(false))}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm"
            onClick={() => { setEditing(false); setName(blueprint.name); setStages(initialStages); }}>Cancel</button>
        </div>

        {stages.map((s, i) => (
          <div key={i} className="q-row">
            <input className="q-input q-fill" placeholder="Stage" value={s.name} onChange={(e) => patchStage(i, { name: e.target.value })} />
            <input className="q-input" list={`role-options-${blueprint.id}`} placeholder="Role (optional)" value={s.roleName}
              onChange={(e) => patchStage(i, { roleName: e.target.value })} style={{ width: '11rem' }} />
            <label className="q-row q-meta-plain" style={{ gap: '4px' }}>
              <input type="checkbox" checked={s.frontStage} onChange={(e) => patchStage(i, { frontStage: e.target.checked })} />
              Front-stage
            </label>
            <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => removeStage(i)}>Remove</button>
          </div>
        ))}
        <datalist id={`role-options-${blueprint.id}`}>{roleOptions.map((r) => <option key={r} value={r} />)}</datalist>
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={addStage} style={{ alignSelf: 'flex-start' }}>+ Add stage</button>
        <span className="q-meta-sm">Order follows the list above. Work already started keeps the stages it was given.</span>
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
        <div className="q-row" style={{ marginTop: '5px', flexWrap: 'wrap' }}>
          {(blueprint.stages || []).map((s: any, i: number) => (
            <span key={i} className="q-badge q-badge-neutral">
              {s.name}{s.roleName ? ` · ${s.roleName}` : ''}{s.front_stage === false ? ' (back-stage)' : ''}
            </span>
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

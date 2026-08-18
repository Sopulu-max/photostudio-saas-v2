'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBlueprint } from '@/modules/services/interface';

type Stage = { name: string; roleName: string; frontStage: boolean };

/**
 * A blueprint is a routing, not just a name list — each stage can suggest
 * who does it (a role, Team's own vocabulary — typing a new one just
 * creates it) and whether it's front-stage (client present) or back-stage.
 * Both are optional; a bare stage name still works exactly as before.
 */
export function NewBlueprintForm({ roleOptions }: { roleOptions: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [stages, setStages] = useState<Stage[]>([{ name: '', roleName: '', frontStage: true }]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const patchStage = (i: number, updates: Partial<Stage>) =>
    setStages((s) => s.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const addStage = () => setStages((s) => [...s, { name: '', roleName: '', frontStage: true }]);
  const removeStage = (i: number) => setStages((s) => s.filter((_, idx) => idx !== i));

  const submit = () => {
    const stageList = stages.filter((s) => s.name.trim());
    if (!name.trim() || stageList.length === 0) return;
    startTransition(async () => {
      try {
        await createBlueprint({
          name: name.trim(),
          stages: stageList.map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
        });
        setName(''); setStages([{ name: '', roleName: '', frontStage: true }]); setOpen(false);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to create blueprint.');
      }
    });
  };

  if (!open) {
    return <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>+ New blueprint</button>;
  }

  return (
    <div className="q-tile q-stack q-stack-sm">
      <input autoFocus className="q-input" placeholder="Blueprint name" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />

      {stages.map((s, i) => (
        <div key={i} className="q-row">
          <input className="q-input q-fill" placeholder="Stage — e.g. Shoot" value={s.name} onChange={(e) => patchStage(i, { name: e.target.value })} />
          <input className="q-input" list="role-options" placeholder="Role (optional)" value={s.roleName}
            onChange={(e) => patchStage(i, { roleName: e.target.value })} style={{ width: '11rem' }} />
          <label className="q-row q-meta-plain" style={{ gap: '4px' }}>
            <input type="checkbox" checked={s.frontStage} onChange={(e) => patchStage(i, { frontStage: e.target.checked })} />
            Front-stage
          </label>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => removeStage(i)}>Remove</button>
        </div>
      ))}
      <datalist id="role-options">{roleOptions.map((r) => <option key={r} value={r} />)}</datalist>

      <div className="q-row">
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={addStage}>+ Add stage</button>
        <span className="q-spacer" />
        <button className="q-btn q-btn-primary" onClick={submit} disabled={isPending}>{isPending ? 'Creating…' : 'Create'}</button>
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
      </div>
      <span className="q-meta-sm">
        A role is a lead for who&rsquo;s assigned, not a requirement — anyone can still be assigned. Front-stage means the client is present or involved.
      </span>
    </div>
  );
}

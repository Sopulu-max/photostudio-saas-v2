'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBlueprint } from '@/modules/services/interface';

export function NewBlueprintForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [stages, setStages] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const stageList = stages.split(',').map((s) => ({ name: s.trim() })).filter((s) => s.name);
    if (!name.trim() || stageList.length === 0) return;
    startTransition(async () => {
      try {
        await createBlueprint({ name: name.trim(), stages: stageList });
        setName(''); setStages(''); setOpen(false);
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      <input autoFocus className="q-input" placeholder="Blueprint name" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
      <input className="q-input" placeholder="stages, comma separated" value={stages} onChange={(e) => setStages(e.target.value)} style={{ minWidth: '16rem' }} />
      <button className="q-btn q-btn-primary" onClick={submit} disabled={isPending}>{isPending ? 'Creating…' : 'Create'}</button>
      <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
    </div>
  );
}

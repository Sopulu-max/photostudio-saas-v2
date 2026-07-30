'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCategory, renameCategory, deleteCategory } from '@/modules/services/interface';

type Category = { id: string; name: string; position: number };

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

function CategoryRow({ category, count }: { category: Category; count: number }) {
  const { isPending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  if (editing) {
    return (
      <div className="q-tile q-row">
        <input autoFocus className="q-input q-fill" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
          onClick={() => name.trim() && run(() => renameCategory({ categoryId: category.id, name }), () => setEditing(false))}>
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setName(category.name); }}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="q-tile q-row q-row-between">
      <div className="q-row">
        <strong className="q-strong">{category.name}</strong>
        <span className="q-meta-sm">{count} {count === 1 ? 'service' : 'services'}</span>
      </div>
      <div className="q-row">
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Rename</button>
        <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
          onClick={() => run(() => deleteCategory(category.id))}>Remove</button>
      </div>
    </div>
  );
}

/**
 * How the studio arranges its own catalogue. Removing a group never removes its
 * services — they simply become ungrouped.
 */
export function CategoryManager({ categories, counts }: { categories: Category[]; counts: Record<string, number> }) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="q-stack q-stack-md">
      {categories.length === 0 ? (
        <p className="q-empty">No groups yet — everything sits in one list.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {categories.map((c) => <CategoryRow key={c.id} category={c} count={counts[c.id] || 0} />)}
        </div>
      )}

      {open ? (
        <div className="q-row">
          <input autoFocus className="q-input" placeholder="e.g. Weddings" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) run(() => createCategory(name.trim()), () => { setName(''); setOpen(false); }); }}
            style={{ minWidth: '12rem' }} />
          <button className="q-btn q-btn-primary" disabled={isPending}
            onClick={() => name.trim() && run(() => createCategory(name.trim()), () => { setName(''); setOpen(false); })}>
            Add group
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>+ New group</button>
      )}

      <span className="q-meta-sm">
        Removing a group leaves its services in place — they just become ungrouped.
      </span>
    </div>
  );
}

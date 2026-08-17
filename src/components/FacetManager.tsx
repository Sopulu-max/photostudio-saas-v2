'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Facet = { id: string; name: string; position: number };

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

function FacetRow({
  facet, count, noun, onRename, onDelete, countDim,
}: {
  facet: Facet;
  count: number;
  noun: string;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** When given, the count becomes a way back up into everything tagged with this value — "select backwards into their upper classification." A plain string, not a function: server → client component props can't carry closures. */
  countDim?: string;
}) {
  const { isPending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(facet.name);

  if (editing) {
    return (
      <div className="q-tile q-row">
        <input autoFocus className="q-input q-fill" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
          onClick={() => name.trim() && run(() => onRename(facet.id, name), () => setEditing(false))}>
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setName(facet.name); }}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="q-tile q-row q-row-between">
      <div className="q-row">
        <strong className="q-strong">{facet.name}</strong>
        {countDim && count > 0 ? (
          <Link href={`/services?dim=${countDim}&id=${facet.id}&label=${encodeURIComponent(facet.name)}`} className="q-meta-sm">
            {count} {count === 1 ? noun : `${noun}s`} &rarr;
          </Link>
        ) : (
          <span className="q-meta-sm">{count} {count === 1 ? noun : `${noun}s`}</span>
        )}
      </div>
      <div className="q-row">
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Rename</button>
        <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
          onClick={() => run(() => onDelete(facet.id))}>Remove</button>
      </div>
    </div>
  );
}

/**
 * Studio-editable, open vocabulary — the same mechanism as Category, reused
 * for Discipline, Subject, and Context. Removing a value never removes the
 * services carrying it; they just lose that facet.
 */
export function FacetManager({
  facets, counts, noun, placeholder, onCreate, onRename, onDelete, countDim,
}: {
  facets: Facet[];
  counts: Record<string, number>;
  /** singular noun for a service, e.g. "service" — used in the count label */
  noun: string;
  placeholder: string;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  countDim?: string;
}) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="q-stack q-stack-md">
      {facets.length === 0 ? (
        <p className="q-empty">None yet. Defining one on a service also creates it here.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {facets.map((f) => (
            <FacetRow key={f.id} facet={f} count={counts[f.id] || 0} noun={noun} onRename={onRename} onDelete={onDelete} countDim={countDim} />
          ))}
        </div>
      )}

      {open ? (
        <div className="q-row">
          <input autoFocus className="q-input" placeholder={placeholder} value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) run(() => onCreate(name.trim()), () => { setName(''); setOpen(false); }); }}
            style={{ minWidth: '12rem' }} />
          <button className="q-btn q-btn-primary" disabled={isPending}
            onClick={() => name.trim() && run(() => onCreate(name.trim()), () => { setName(''); setOpen(false); })}>
            Add
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>+ New</button>
      )}
    </div>
  );
}

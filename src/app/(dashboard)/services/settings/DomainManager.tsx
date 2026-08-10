'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';

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

export function DomainManager({
  domains, counts, onCreate, onDelete
}: {
  domains: { id: string; name: string }[];
  counts: Record<string, number>;
  onCreate: (name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="q-stack q-stack-md">
      {domains.length === 0 ? (
        <p className="q-empty">No Service Domains configured.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {domains.map((d) => (
            <div key={d.id} className="q-tile q-row q-row-between">
              <div className="q-row">
                <strong className="q-strong">{d.name}</strong>
                <span className="q-meta-sm">{counts[d.id] || 0} services</span>
              </div>
              <div className="q-row">
                <Link href={`/services/settings/domains/${d.id}`} className="q-btn q-btn-secondary q-btn-xs" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Settings size={14} /> Edit DNA
                </Link>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                  onClick={() => run(() => onDelete(d.id))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="q-row">
          <input autoFocus className="q-input" placeholder="e.g. Graphic Design" value={name}
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
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>+ New Domain</button>
      )}
    </div>
  );
}

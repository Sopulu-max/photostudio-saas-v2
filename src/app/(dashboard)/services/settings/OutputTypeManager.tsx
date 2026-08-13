'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listOutputTypesByDomain, createDeliverable, renameDeliverable, deleteDeliverable } from '@/modules/services/interface';

/**
 * What each domain can produce.
 *
 * An output type is a KIND — edited photographs, a bound album — and like a
 * dimension it belongs to one service domain. Photography producing "Contact
 * sheet" says nothing about Printing, which is what lets a studio expand into a
 * domain without dragging the others along.
 *
 * Kind only: how many, how big, what spec is a package's business. That is why
 * there is no quantity field anywhere on this page.
 */
export function OutputTypeManager({ domains }: { domains: { id: string; name: string }[] }) {
  const [domainId, setDomainId] = useState(domains[0]?.id || '');
  const [byDomain, setByDomain] = useState<Record<string, { id: string; name: string }[]>>({});
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState('');
  const router = useRouter();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setByDomain(await listOutputTypesByDomain()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); await load(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That didn’t work.'); }
    });

  if (domains.length === 0) {
    return (
      <p className="q-empty">
        Add a service domain first — an output type belongs to one, so there&rsquo;s nothing to produce yet.
      </p>
    );
  }

  const domainName = domains.find((d) => d.id === domainId)?.name || '';
  const types = byDomain[domainName] || [];

  return (
    <div className="q-stack q-stack-md">
      <div className="q-field">
        <label className="q-label">Which domain?</label>
        <select className="q-select" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="q-meta">Loading…</p>
      ) : (
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {types.map((t) => (
            <span key={t.id} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }}
              title="Rename, or remove"
              onClick={() => {
                const next = prompt(`Rename “${t.name}” — or clear it to remove.`, t.name);
                if (next === null) return;
                if (!next.trim()) {
                  if (!confirm(`Remove ${t.name} from ${domainName}?`)) return;
                  return run(() => deleteDeliverable(t.id));
                }
                run(() => renameDeliverable(t.id, next));
              }}>
              {t.name}
            </span>
          ))}
          {types.length === 0 && <span className="q-meta-sm">Nothing yet — the first service that names one creates it.</span>}
        </div>
      )}

      <div className="q-row">
        <input
          className="q-input q-input-sm"
          placeholder="e.g. Edited photographs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (draft.trim()) run(() => createDeliverable({ serviceDomainId: domainId, name: draft }), () => setDraft(''));
          }}
          style={{ minWidth: '14rem' }}
        />
        <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending || !draft.trim()}
          onClick={() => run(() => createDeliverable({ serviceDomainId: domainId, name: draft }), () => setDraft(''))}>
          Add to {domainName || 'this domain'}
        </button>
      </div>
    </div>
  );
}

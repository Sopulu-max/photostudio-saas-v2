'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listOutputTypesByDomain, createDeliverable, renameDeliverable, deleteDeliverable } from '@/modules/deliverables/interface';
import { narrowFor } from '@/modules/services/interface';
import type { Narrowed } from '@/modules/services/interface';
import { PickToAdd } from '@/components/Pick';
import { toast, readableError } from '@/components/Toast';

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
export function OutputTypeManager({
  domains, suggestions,
}: {
  domains: { id: string; name: string }[];
  /** What the library and this studio's own services say this domain produces. */
  suggestions?: Narrowed;
}) {
  const [domainId, setDomainId] = useState(domains[0]?.id || '');
  const [byDomain, setByDomain] = useState<Record<string, { id: string; name: string }[]>>({});
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
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
      catch (e: any) { toast.bad(readableError(e, 'The change could not be saved.')); }
    });

  if (domains.length === 0) {
    return (
      <p className="q-empty">
        Add a service domain first. Output types belong to a domain.
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
          {types.length === 0 && <span className="q-meta-sm">None yet. Defining one on a service also creates it here.</span>}
        </div>
      )}

      <PickToAdd
        options={narrowFor(suggestions, domainName, '')
          .filter((o) => !types.some((t) => t.name.toLowerCase() === o.toLowerCase()))}
        placeholder={`Add an output type for ${domainName || 'this domain'}`}
        disabled={isPending}
        onAdd={(v) => run(() => createDeliverable({ serviceDomainId: domainId, name: v }))}
      />
    </div>
  );
}

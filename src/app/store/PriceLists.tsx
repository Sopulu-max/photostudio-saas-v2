'use client';

import { useState, useTransition } from 'react';
import {
  addPriceList, addProduct, addProductVariant, removeProduct, removeProductVariant,
} from '@/weave/store/actions';
import { money, type PriceList, type ProductKind } from '@/weave/store/shape';

/**
 * Price lists, and what is on them.
 *
 * `kind` offers exactly two choices because the engine does exactly two things:
 * a digital thing is fulfilled by handing over the file, a physical thing has
 * to be made and sent. Lustre or matte, 8x10 or 20x30, album or canvas - all of
 * that is the studio's own word in the name, and the engine has no opinion.
 */
export function PriceLists({ lists }: { lists: PriceList[] }) {
  const [listName, setListName] = useState('');
  const [draft, setDraft] = useState<Record<string, { name: string; kind: ProductKind; price: string }>>({});
  const [variantDraft, setVariantDraft] = useState<Record<string, { name: string; priceDelta: string }>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const draftFor = (id: string) => draft[id] ?? { name: '', kind: 'physical' as ProductKind, price: '' };
  const setDraftFor = (id: string, patch: Partial<{ name: string; kind: ProductKind; price: string }>) =>
    setDraft((had) => ({ ...had, [id]: { ...draftFor(id), ...patch } }));
  const variantFor = (id: string) => variantDraft[id] ?? { name: '', priceDelta: '' };
  const setVariantFor = (id: string, patch: Partial<{ name: string; priceDelta: string }>) =>
    setVariantDraft((had) => ({ ...had, [id]: { ...variantFor(id), ...patch } }));

  return (
    <div className="q-stack q-stack-md">
      {lists.map((list) => (
        <section key={list.id} className="q-card q-stack q-stack-sm">
          <h2 className="q-section-title">{list.name}</h2>

          {list.products.length === 0 ? (
            <p className="q-empty">Nothing on this list yet.</p>
          ) : (
            <div className="q-stack q-stack-xs">
              {list.products.map((p) => (
                <div key={p.id} className="q-stack q-stack-xs">
                  <div className="q-row q-row-between">
                    <span className="q-text-body">
                      {p.name}
                      <span className="q-meta"> &middot; {p.kind === 'digital' ? 'a file' : 'made and sent'}</span>
                    </span>
                    <span className="q-row q-row-sm">
                      <strong className="q-num">{money(p.price, p.currency)}</strong>
                      <button
                        type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                        onClick={() => run(() => removeProduct({ productId: p.id }))}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                  {p.variants.map((variant) => (
                    <div className="q-row q-row-between" key={variant.id}>
                      <span className="q-meta">{variant.name}</span>
                      <span className="q-row q-row-sm">
                        <span className="q-num">{money(p.price + variant.priceDelta, p.currency)}</span>
                        <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                          onClick={() => run(() => removeProductVariant({ variantId: variant.id }))}>
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}
                  <form className="q-row q-row-sm" onSubmit={(event) => {
                    event.preventDefault();
                    const variant = variantFor(p.id);
                    const delta = Number(variant.priceDelta);
                    if (!variant.name.trim()) { setProblem('Give the option a name.'); return; }
                    if (!Number.isFinite(delta) || p.price + Math.round(delta * 100) < 0) {
                      setProblem('That option would make the price invalid.'); return;
                    }
                    run(async () => {
                      await addProductVariant({ productId: p.id, name: variant.name, priceDelta: Math.round(delta * 100) });
                      setVariantFor(p.id, { name: '', priceDelta: '' });
                    });
                  }}>
                    <input className="q-input q-input-sm" placeholder="Option, e.g. 12 × 18" value={variantFor(p.id).name}
                      onChange={(event) => setVariantFor(p.id, { name: event.target.value })} disabled={working} />
                    <input className="q-input q-input-sm" type="number" step="0.01" placeholder="Price change" value={variantFor(p.id).priceDelta}
                      onChange={(event) => setVariantFor(p.id, { priceDelta: event.target.value })} disabled={working} />
                    <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working}>Add option</button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <form
            className="q-row q-row-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const d = draftFor(list.id);
              const major = Number(d.price);
              if (!d.name.trim()) { setProblem('Give it a name.'); return; }
              if (!Number.isFinite(major) || major < 0) { setProblem('That price is not a price.'); return; }
              run(async () => {
                // Typed in whole units, stored in minor ones.
                await addProduct({
                  priceListId: list.id, name: d.name, kind: d.kind, price: Math.round(major * 100),
                });
                setDraftFor(list.id, { name: '', price: '' });
              });
            }}
          >
            <input
              className="q-input" placeholder="What it is, in your words"
              value={draftFor(list.id).name} disabled={working}
              onChange={(e) => setDraftFor(list.id, { name: e.target.value })}
            />
            <select
              className="q-input q-input-sm" value={draftFor(list.id).kind} disabled={working}
              onChange={(e) => setDraftFor(list.id, { kind: e.target.value as ProductKind })}
            >
              <option value="physical">Made and sent</option>
              <option value="digital">A file</option>
            </select>
            <input
              className="q-input q-input-sm" type="number" min="0" step="0.01" placeholder="Price"
              value={draftFor(list.id).price} disabled={working}
              onChange={(e) => setDraftFor(list.id, { price: e.target.value })}
            />
            <button className="q-btn q-btn-secondary" type="submit" disabled={working}>Add</button>
          </form>
        </section>
      ))}

      <form
        className="q-card q-row q-row-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listName.trim()) { setProblem('A price list needs a name.'); return; }
          run(async () => { await addPriceList({ name: listName }); setListName(''); });
        }}
      >
        <input
          className="q-input" placeholder="Name a new price list"
          value={listName} disabled={working}
          onChange={(e) => setListName(e.target.value)}
        />
        <button className="q-btn q-btn-primary" type="submit" disabled={working}>
          {working ? 'Making' : 'Make one'}
        </button>
      </form>

      {problem && <p className="q-meta">{problem}</p>}
    </div>
  );
}

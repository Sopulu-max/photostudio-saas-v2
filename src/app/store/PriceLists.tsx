'use client';

import { useState, useTransition } from 'react';
import {
  addPriceList, addProduct, addProductVariant, removeProduct, removeProductVariant,
} from '@/weave/store/actions';
import { Reveal } from '@/components/Reveal';
import { money, type PriceList, type ProductKind } from '@/weave/store/shape';

/**
 * Price lists, and what is on them.
 *
 * `kind` offers exactly two choices because the engine does exactly two things:
 * a digital thing is fulfilled by handing over the file, a physical thing has
 * to be made and sent. Lustre or matte, 8x10 or 20x30, album or canvas - all of
 * that is the studio's own word in the name, and the engine has no opinion.
 *
 * The page reads as a price list — a name, a rule, a figure — and every form
 * that makes or changes one waits behind a line until it is wanted.
 */
export function PriceLists({ lists }: { lists: PriceList[] }) {
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

  return (
    <div className="q-stack q-stack-lg">
      {lists.map((list) => (
        <section key={list.id} className="q-stack q-stack-sm">
          <h2 className="q-list-name">{list.name}</h2>

          {list.products.length === 0 ? (
            <p className="q-empty">Nothing on this list yet.</p>
          ) : (
            <div className="q-sheet">
              {list.products.map((p) => (
                <div key={p.id} className="q-ware">
                  <div className="q-ware-head">
                    <span className="q-ware-name">{p.name}</span>
                    <span className="q-ware-rule" aria-hidden="true" />
                    <span className="q-num q-ware-price">{money(p.price, p.currency)}</span>
                    <button
                      type="button" className="q-ware-drop" disabled={working}
                      onClick={() => run(() => removeProduct({ productId: p.id }))}
                      aria-label={`Remove ${p.name}`}
                    >
                      Remove
                    </button>
                  </div>

                  <span className="q-ware-kind">
                    {p.kind === 'digital' ? 'A file' : 'Made and sent'}
                  </span>

                  {p.variants.map((variant) => (
                    <div className="q-ware-head q-ware-option" key={variant.id}>
                      <span className="q-ware-name">{variant.name}</span>
                      <span className="q-ware-rule" aria-hidden="true" />
                      <span className="q-num q-ware-price">
                        {money(p.price + variant.priceDelta, p.currency)}
                      </span>
                      <button
                        type="button" className="q-ware-drop" disabled={working}
                        onClick={() => run(() => removeProductVariant({ variantId: variant.id }))}
                        aria-label={`Remove ${variant.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <Reveal says="Add an option">
                    {(done) => (
                      <form
                        className="q-row q-row-sm"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          const name = String(form.get('name') ?? '').trim();
                          const delta = Number(form.get('delta'));
                          if (!name) { setProblem('Give the option a name.'); return; }
                          if (!Number.isFinite(delta) || p.price + Math.round(delta * 100) < 0) {
                            setProblem('That option would make the price invalid.'); return;
                          }
                          run(async () => {
                            await addProductVariant({
                              productId: p.id, name, priceDelta: Math.round(delta * 100),
                            });
                            done();
                          });
                        }}
                      >
                        <input
                          className="q-input q-input-sm" name="name" autoFocus
                          placeholder="Option, e.g. 12 × 18" disabled={working}
                        />
                        <input
                          className="q-input q-input-sm" name="delta" type="number" step="0.01"
                          defaultValue="0" placeholder="Price change" disabled={working}
                        />
                        <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working}>
                          Add
                        </button>
                      </form>
                    )}
                  </Reveal>
                </div>
              ))}
            </div>
          )}

          <Reveal says="Add something to this list">
            {(done) => (
              <form
                className="q-row q-row-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const name = String(form.get('name') ?? '').trim();
                  const major = Number(form.get('price'));
                  const kind = String(form.get('kind') ?? 'physical') as ProductKind;
                  if (!name) { setProblem('Give it a name.'); return; }
                  if (!Number.isFinite(major) || major < 0) {
                    setProblem('That price is not a price.'); return;
                  }
                  run(async () => {
                    // Typed in whole units, stored in minor ones.
                    await addProduct({
                      priceListId: list.id, name, kind, price: Math.round(major * 100),
                    });
                    done();
                  });
                }}
              >
                <input
                  className="q-input" name="name" autoFocus disabled={working}
                  placeholder="What it is, in your words"
                />
                <select className="q-input q-input-sm" name="kind" disabled={working}>
                  <option value="physical">Made and sent</option>
                  <option value="digital">A file</option>
                </select>
                <input
                  className="q-input q-input-sm" name="price" type="number" min="0" step="0.01"
                  placeholder="Price" disabled={working}
                />
                <button className="q-btn q-btn-secondary q-btn-sm" type="submit" disabled={working}>
                  Add
                </button>
              </form>
            )}
          </Reveal>
        </section>
      ))}

      <Reveal says="Start another price list">
        {(done) => (
          <form
            className="q-row q-row-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
              if (!name) { setProblem('A price list needs a name.'); return; }
              run(async () => { await addPriceList({ name }); done(); });
            }}
          >
            <input
              className="q-input" name="name" autoFocus disabled={working}
              placeholder="Name a new price list"
            />
            <button className="q-btn q-btn-primary q-btn-sm" type="submit" disabled={working}>
              {working ? 'Making' : 'Make one'}
            </button>
          </form>
        )}
      </Reveal>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { addPackage, removePackage, setPackageOffered } from '@/weave/packages/actions';
import { isPublished, sayPackage, type Package } from '@/weave/packages/shape';
import { money } from '@/weave/store/shape';
import { Reveal } from '@/components/Reveal';

/**
 * What the studio offers.
 *
 * A package here is not a description of work: accepting a booking that names
 * one opens a gallery sized by its promise. So the number of pictures is
 * given the weight it deserves — it is the thing that becomes structure.
 */
export function Packages({ packages }: { packages: Package[] }) {
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
    <div className="q-stack q-stack-md">
      {packages.length === 0 ? (
        <p className="q-empty">
          Nothing offered yet. A package says what a client gets back, and
          opens a gallery that size the moment you take the booking.
        </p>
      ) : (
        <div className="q-sheet">
          {packages.map((p) => (
            <div className="q-pack" key={p.id}>
              <div className="q-pack-what">
                <strong className="q-pack-name">{p.name}</strong>
                <span className="q-meta">{sayPackage(p)}</span>
                {p.about && <span className="q-meta-sm">{p.about}</span>}
              </div>

              <span className="q-num q-pack-price">
                {p.price === null ? 'No price yet' : money(p.price, p.currency)}
              </span>

              <span className="q-pack-acts">
                <span className={isPublished(p) ? 'q-pack-on' : 'q-pack-off'}>
                  {isPublished(p) ? 'Offered' : 'Not offered'}
                </span>
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => run(() => setPackageOffered({
                    packageId: p.id, offered: !isPublished(p),
                  }))}
                >
                  {isPublished(p) ? 'Stop offering it' : 'Offer it'}
                </button>
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => run(() => removePackage({ packageId: p.id }))}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <Reveal says="Offer something new">
        {(done) => (
          <form
            className="q-stack q-stack-xs q-reveal-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get('name') ?? '').trim();
              const major = String(form.get('price') ?? '').trim();
              const pics = String(form.get('pictures') ?? '').trim();
              if (!name) { setProblem('What is it called?'); return; }
              run(async () => {
                await addPackage({
                  name,
                  about: String(form.get('about') ?? ''),
                  // Typed in whole units, stored in minor ones.
                  price: major === '' ? null : Math.round(Number(major) * 100),
                  picturesPromised: pics === '' ? null : Number(pics),
                });
                done();
              });
            }}
          >
            <div className="q-row q-row-sm">
              <input
                className="q-input" name="name" autoFocus disabled={working}
                placeholder="What it is called, in your words"
              />
              <input
                className="q-input q-input-sm" name="pictures" type="number" min="1"
                disabled={working} placeholder="Pictures"
              />
              <input
                className="q-input q-input-sm" name="price" type="number" min="0" step="0.01"
                disabled={working} placeholder="Price"
              />
            </div>
            <textarea
              className="q-input" name="about" rows={2} disabled={working}
              placeholder="What it covers, if you want to say more"
            />
            <button
              className="q-btn q-btn-secondary q-btn-sm q-self-start" type="submit" disabled={working}
            >
              Add it
            </button>
          </form>
        )}
      </Reveal>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}

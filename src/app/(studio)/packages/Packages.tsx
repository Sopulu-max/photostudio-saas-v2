'use client';

import { useState, useTransition } from 'react';
import {
  addPackage, amendPackage, removePackage, setPackageOffered,
} from '@/weave/packages/actions';
import { isPublished, sayPackage, sayShape, type Package } from '@/weave/packages/shape';
import type { GalleryTemplate } from '@/weave/galleries/shape';
import { money } from '@/weave/store/shape';
import { Reveal } from '@/components/Reveal';

/**
 * What the studio offers.
 *
 * A package here is not a description of work: accepting a booking that names
 * one opens a gallery sized by its promise. So the number of pictures is
 * given the weight it deserves — it is the thing that becomes structure.
 */
export function Packages({
  packages, templates,
}: {
  packages: Package[];
  templates: GalleryTemplate[];
}) {
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
          No packages. A package defines what the client receives, and opens a
          gallery of that size when a booking is accepted.
        </p>
      ) : (
        <div className="q-sheet">
          {packages.map((p) => (
            <div className="q-pack" key={p.id}>
              <div className="q-pack-what">
                <strong className="q-pack-name">{p.name}</strong>
                <span className="q-meta">{sayPackage(p)}</span>
                {/*
                  * What it produces, said next to what it promises, because
                  * they are the two halves of the same thing: how many
                  * pictures, and the gallery they arrive in.
                  */}
                <span className="q-meta-sm">
                  {sayShape(templates.find((t) => t.id === p.galleryTemplateId) ?? null)}
                </span>
                {p.about && <span className="q-meta-sm">{p.about}</span>}
              </div>

              <span className="q-num q-pack-price">
                {p.price === null ? 'No price set' : money(p.price, p.currency)}
              </span>

              <span className="q-pack-acts">
                {/*
                  * Only offered where there is something to choose. A studio
                  * with no gallery templates is not missing a feature, so it
                  * is not shown a control that can only say "none".
                  */}
                {templates.length > 0 && (
                  <select
                    className="q-input q-input-sm"
                    aria-label={`Gallery shape for ${p.name}`}
                    value={p.galleryTemplateId ?? ''}
                    disabled={working}
                    onChange={(event) => run(() => amendPackage({
                      packageId: p.id,
                      galleryTemplateId: event.target.value || null,
                    }))}
                  >
                    <option value="">Plain gallery</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                <span className={isPublished(p) ? 'q-pack-on' : 'q-pack-off'}>
                  {isPublished(p) ? 'Published' : 'Draft'}
                </span>
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => run(() => setPackageOffered({
                    packageId: p.id, offered: !isPublished(p),
                  }))}
                >
                  {isPublished(p) ? 'Unpublish' : 'Publish'}
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

      <Reveal says="Add package">
        {(done) => (
          <form
            className="q-stack q-stack-xs q-reveal-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get('name') ?? '').trim();
              const major = String(form.get('price') ?? '').trim();
              const pics = String(form.get('pictures') ?? '').trim();
              if (!name) { setProblem('Enter a package name.'); return; }
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
                placeholder="Package name"
              />
              <input
                className="q-input q-input-sm" name="pictures" type="number" min="1"
                disabled={working} placeholder="Images"
              />
              <input
                className="q-input q-input-sm" name="price" type="number" min="0" step="0.01"
                disabled={working} placeholder="Price"
              />
            </div>
            <textarea
              className="q-input" name="about" rows={2} disabled={working}
              placeholder="Description (optional)"
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

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addPackage, removePackage, setPackageOffered,
} from '@/weave/packages/actions';
import { isPublished, type Package } from '@/weave/packages/shape';
import { promisesOf, sayPromises, type PackageElement } from '@/weave/packages/elements';
import type { Deliverable } from '@/weave/deliverables/shape';
import type { PackageMedia as Media } from '@/weave/packages/media';
import { money } from '@/weave/store/shape';

/**
 * What the studio offers.
 *
 * A shelf of packages, each shown by its own photograph, because that is how
 * a studio recognises its own offers and how a client will meet them. This
 * was one package per row at full width, so three packages made a page a
 * client would have to scroll for a minute.
 *
 * WHAT EACH ONE PROMISES IS COUNTED, not read from a column. Every card used
 * to say "Image count not set", which came from `pictures_promised` — a field
 * nothing fills any more. A package promising seven edited images and three
 * framed prints was reporting that it promised nothing.
 */
export function Packages({ packages, media, elements, catalogue }: {
  packages: Package[];
  media: Media[];
  elements: PackageElement[];
  catalogue: Deliverable[];
}) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
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
      {problem && <p className="q-note q-note-bad">{problem}</p>}

      {packages.length === 0 ? (
        <p className="q-empty">
          No packages. A package is what a client books: what they receive,
          and what it costs.
        </p>
      ) : (
        <div className="q-packs">
          {packages.map((p) => {
            const mine = elements.filter((e) => e.packageId === p.id);
            const promise = promisesOf(mine, catalogue);
            const cover = media.find((m) => m.packageId === p.id);

            return (
              <article className="q-pcard" key={p.id}>
                <Link className="q-pcard-face" href={`/packages/${p.id}`}>
                  <span className="q-pcard-cover">
                    {cover ? (
                      cover.kind === 'video'
                        ? <video src={cover.url} muted loop playsInline />
                        /* eslint-disable-next-line @next/next/no-img-element */
                        : <img src={cover.url} alt="" />
                    ) : (
                      <span className="q-pcard-bare">No picture</span>
                    )}
                    {/*
                      * On the cover, not in the footer. Down there it had to
                      * share a line with a price and two buttons, which made
                      * the row wrap and left it stranded in the corner.
                      */}
                    <span className={isPublished(p) ? 'q-pcard-flag' : 'q-pcard-flag q-pcard-flag-off'}>
                      {isPublished(p) ? 'Published' : 'Draft'}
                    </span>
                  </span>
                  <span className="q-pcard-words">
                    {/* The studio's own name for it, exactly as typed. */}
                    <span className="q-pcard-name">{p.name}</span>
                    {/* Counted off the package, so it cannot disagree with it. */}
                    <span className="q-pcard-gets">{sayPromises(promise)}</span>
                  </span>
                </Link>

                <div className="q-pcard-foot">
                  <span className="q-num">
                    {p.price === null ? 'No price set' : money(p.price, p.currency)}
                  </span>
                  <span className="q-pcard-acts">
                    <button
                      type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                      onClick={() => run(() => setPackageOffered({
                        packageId: p.id, offered: !isPublished(p),
                      }))}
                    >
                      {isPublished(p) ? 'Unpublish' : 'Publish'}
                    </button>
                    {/*
                      * Asked once. A package carries everything that was laid
                      * out on it, and there is nothing to undo it with.
                      */}
                    {sure === p.id ? (
                      <>
                        <button
                          type="button" className="q-btn q-btn-danger q-btn-xs" disabled={working}
                          onClick={() => {
                            setSure(null);
                            run(() => removePackage({ packageId: p.id }));
                          }}
                        >Remove</button>
                        <button
                          type="button" className="q-btn q-btn-ghost q-btn-xs"
                          onClick={() => setSure(null)}
                        >Keep</button>
                      </>
                    ) : (
                      <button
                        type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                        onClick={() => setSure(p.id)}
                      >Remove</button>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/*
        * One button. There was a bar here asking for a name and a price,
        * which is what a package used to BE — before it was made of
        * deliverables, questions and pictures. The designer asks for the
        * name, description and price at the top of itself, so asking here
        * first put the same two fields on screen twice and implied they
        * were the package.
        */}
      <button
        type="button" className="q-btn q-btn-primary q-self-start"
        disabled={working}
        onClick={() => run(async () => {
          const created = await addPackage({ name: 'Untitled package' });
          router.push(`/packages/${created.id}`);
        })}
      >
        Add package
      </button>
    </div>
  );
}

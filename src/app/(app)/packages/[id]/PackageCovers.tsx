'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addPackageImage, removePackageImage, setPackageImagePosition, reorderPackageImages,
  type PackageImage,
} from '@/modules/packages/interface';
import { ImageUpload } from '@/components/ImageUpload';
import { toast, readableError } from '@/components/Toast';

/** A picture that may not have a row yet, because its package may not either. */
export type Slide = { id: string | null; url: string; position: string | null };

export const MAX_PACKAGE_IMAGES = 20;

/**
 * The pictures a package is sold with.
 *
 * THE FIRST ONE IS THE COVER. Not a separate choice — the cover is a reading of
 * this order, so making a different picture lead is the same act as moving it
 * to the front. A "make this the cover" control would be a second way to say
 * the same thing, and two ways to say one thing is how they come to disagree.
 *
 * EACH PICTURE CARRIES ITS OWN FRAMING. A cover is drawn 16:9 on a card and 3:1
 * across a page, and almost no photograph is either — so each one is dragged
 * into place separately, which is what the single cover_position always was and
 * could only ever be right about for one picture.
 *
 * ARROWS, NOT DRAGGING. The frame itself is already a drag surface — that is how
 * a picture is positioned — so dragging a card to reorder would be the same
 * gesture meaning two things on the same element. Arrows also work from a
 * keyboard without anything extra being built for them.
 *
 * BEFORE THE PACKAGE EXISTS. On a new package there is no row to hang a picture
 * on, so the set is held here and written once the package has an id. The
 * alternative was telling somebody to save first and come back, which would make
 * choosing a picture the one part of building a package that happens afterwards.
 */
export function PackageCovers({
  packageId,
  initial,
  onStaged,
  disabled,
}: {
  /** Null while the package is still being created. */
  packageId: string | null;
  initial: PackageImage[];
  /** Told the whole set, in order, whenever it changes and there is no id yet. */
  onStaged?: (slides: Slide[]) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slides, setSlides] = useState<Slide[]>(
    initial.map((i) => ({ id: i.id, url: i.url, position: i.position })),
  );

  const settle = (next: Slide[]) => {
    setSlides(next);
    onStaged?.(next);
  };

  const run = (fn: () => Promise<unknown>, fallback: string) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, fallback)); }
    });

  const add = (url: string) => {
    const next = [...slides, { id: null, url, position: null }];
    settle(next);
    if (!packageId) return;
    startTransition(async () => {
      try {
        const { imageId } = await addPackageImage({ packageId, url });
        // The row it was given, so removing or placing it later has something
        // to name. Matched on the url, which is unique per upload.
        setSlides((prev) => prev.map((s) => (
          s.id === null && s.url === url ? { ...s, id: imageId } : s
        )));
        router.refresh();
      } catch (e) {
        // Taken back off, or the screen would show a picture the studio does
        // not have — including the twenty-first, which the database refuses.
        settle(slides);
        toast.bad(readableError(e, 'That picture could not be added.'));
      }
    });
  };

  const remove = (at: number) => {
    const slide = slides[at];
    settle(slides.filter((_, i) => i !== at));
    if (packageId && slide.id) {
      run(() => removePackageImage({ id: slide.id!, packageId }), 'That picture could not be removed.');
    }
  };

  const place = (at: number, position: string) => {
    const slide = slides[at];
    settle(slides.map((s, i) => (i === at ? { ...s, position } : s)));
    if (packageId && slide.id) {
      run(() => setPackageImagePosition({ id: slide.id!, packageId, position }), 'That could not be changed.');
    }
  };

  const move = (at: number, by: -1 | 1) => {
    const to = at + by;
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    [next[at], next[to]] = [next[to], next[at]];
    settle(next);
    if (packageId && next.every((s) => s.id)) {
      run(
        () => reorderPackageImages({ packageId, ids: next.map((s) => s.id!) }),
        'That order could not be saved.',
      );
    }
  };

  const full = slides.length >= MAX_PACKAGE_IMAGES;

  return (
    <div className="q-field">
      <label className="q-label">Pictures</label>
      <p className="q-meta-sm" style={{ marginBottom: '10px' }}>
        {slides.length === 0
          ? `What the work looks like. Up to ${MAX_PACKAGE_IMAGES}; the first is the cover.`
          : `${slides.length} of ${MAX_PACKAGE_IMAGES}. The first is the cover — drag a picture to choose what shows.`}
      </p>

      <div className="q-slides-edit">
        {slides.map((slide, i) => (
          <div key={slide.id ?? slide.url} className="q-slide-edit">
            <ImageUpload
              url={slide.url}
              folder="packages"
              label="picture"
              /* Twice the widest a cover is ever drawn, which is as much as the
                 densest display can resolve. */
              maxEdge={2400}
              disabled={disabled || isPending}
              onUploaded={(u) => {
                // Replacing this one in place, rather than adding another.
                settle(slides.map((s, k) => (k === i ? { ...s, url: u } : s)));
                if (packageId && slide.id) {
                  run(
                    () => removePackageImage({ id: slide.id!, packageId })
                      .then(() => addPackageImage({ packageId, url: u })),
                    'That picture could not be replaced.',
                  );
                }
              }}
              onCleared={() => remove(i)}
              position={slide.position}
              onPositionChange={(p) => place(i, p)}
            />

            <div className="q-slide-bar">
              <span className={i === 0 ? 'q-slide-no q-slide-no-cover' : 'q-slide-no'}>
                {i === 0 ? 'Cover' : i + 1}
              </span>
              <span className="q-row q-row-sm">
                <button
                  type="button"
                  className="q-btn-ghost q-btn-xs"
                  disabled={disabled || isPending || i === 0}
                  title="Move earlier"
                  aria-label={`Move picture ${i + 1} earlier`}
                  onClick={() => move(i, -1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="q-btn-ghost q-btn-xs"
                  disabled={disabled || isPending || i === slides.length - 1}
                  title="Move later"
                  aria-label={`Move picture ${i + 1} later`}
                  onClick={() => move(i, 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </span>
            </div>
          </div>
        ))}

        {/* The adder is the same control with nothing in it yet, so choosing the
            first picture and the fifth are the same gesture. */}
        {!full && (
          <div className="q-slide-edit">
            <ImageUpload
              url={null}
              folder="packages"
              label={slides.length === 0 ? 'cover' : 'picture'}
              maxEdge={2400}
              disabled={disabled || isPending}
              onUploaded={add}
            />
            <div className="q-slide-bar">
              <span className="q-slide-no">{slides.length === 0 ? 'Cover' : slides.length + 1}</span>
            </div>
          </div>
        )}
      </div>

      {full && (
        <span className="q-meta-sm">
          That is {MAX_PACKAGE_IMAGES}. Remove one to add another.
        </span>
      )}
    </div>
  );
}

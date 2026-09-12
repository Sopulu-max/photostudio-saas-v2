'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronsLeft } from 'lucide-react';
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
 *
 * ONE STAGE, ONE STRIP. This drew the whole editor — drag frame, sentence,
 * Replace, Remove, order — for every picture, so six pictures were six editors
 * and twenty would have been a page of them. Only one picture can be placed
 * at a time, so the frame is drawn once and the set is a strip of thumbnails
 * clicked into it. Each thumbnail is drawn at its own crop, so the strip is
 * honest about what a client will see.
 *
 * "TO THE FRONT" IS REORDERING, NOT A SECOND VOCABULARY. Arrows alone were
 * fine for six; at twenty, leading with the nineteenth is eighteen clicks.
 * The control says "front" and does what the arrows do in one move — it is
 * not a "make this the cover" button, because the cover is still nothing but
 * whatever is first.
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
  /** Which picture is on the stage. Kept in range by every change below. */
  const [selected, setSelected] = useState(0);

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
    // The new one goes on the stage: the next thing to do with it is place it.
    setSelected(next.length - 1);
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
    const next = slides.filter((_, i) => i !== at);
    settle(next);
    setSelected(Math.min(at, Math.max(0, next.length - 1)));
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

  /** Put the picture at `at` in position `to`; the stage follows it. */
  const moveTo = (at: number, to: number) => {
    if (to < 0 || to >= slides.length || to === at) return;
    const next = [...slides];
    const [picked] = next.splice(at, 1);
    next.splice(to, 0, picked);
    settle(next);
    setSelected(to);
    if (packageId && next.every((s) => s.id)) {
      run(
        () => reorderPackageImages({ packageId, ids: next.map((s) => s.id!) }),
        'That order could not be saved.',
      );
    }
  };
  const move = (at: number, by: -1 | 1) => moveTo(at, at + by);

  const full = slides.length >= MAX_PACKAGE_IMAGES;
  const at = Math.min(selected, Math.max(0, slides.length - 1));
  const slide = slides[at];

  return (
    <div className="q-field">
      <label className="q-label">Pictures</label>
      <p className="q-meta-sm" style={{ marginBottom: '10px' }}>
        {slides.length === 0
          ? `What the work looks like. Up to ${MAX_PACKAGE_IMAGES}; the first is the cover.`
          : `${slides.length} of ${MAX_PACKAGE_IMAGES}. The first is the cover — drag a picture to choose what shows.`}
      </p>

      {/* Nothing yet: the adder stands where the stage will, at the stage's
          size, because the first picture is the cover and the cover is seen
          in this frame. As a strip tile it was 112px - a thumbnail of a
          picture that did not exist. */}
      {!slide && (
        <div className="q-stage">
          <ImageUpload
            url={null}
            folder="packages"
            label="cover"
            maxEdge={2400}
            disabled={disabled || isPending}
            onUploaded={add}
          />
        </div>
      )}

      {/* The stage: the one picture being placed, in the frame a client sees it in. */}
      {slide && (
        <div className="q-stage">
          <div className="q-stage-head">
            <span className={at === 0 ? 'q-slide-no q-slide-no-cover' : 'q-slide-no'}>
              {at === 0 ? 'Cover' : `${at + 1} of ${slides.length}`}
            </span>
            <span className="q-row q-row-sm">
              <button
                type="button"
                className="q-btn-ghost q-btn-xs"
                disabled={disabled || isPending || at === 0}
                title="To the front — this becomes the cover"
                aria-label={`Move picture ${at + 1} to the front`}
                onClick={() => moveTo(at, 0)}
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                className="q-btn-ghost q-btn-xs"
                disabled={disabled || isPending || at === 0}
                title="Move earlier"
                aria-label={`Move picture ${at + 1} earlier`}
                onClick={() => move(at, -1)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="q-btn-ghost q-btn-xs"
                disabled={disabled || isPending || at === slides.length - 1}
                title="Move later"
                aria-label={`Move picture ${at + 1} later`}
                onClick={() => move(at, 1)}
              >
                <ChevronRight size={14} />
              </button>
            </span>
          </div>

          <ImageUpload
            key={slide.id ?? slide.url}
            url={slide.url}
            folder="packages"
            label="picture"
            /* Twice the widest a cover is ever drawn, which is as much as the
               densest display can resolve. */
            maxEdge={2400}
            disabled={disabled || isPending}
            onUploaded={(u) => {
              // Replacing this one in place, rather than adding another.
              settle(slides.map((s, k) => (k === at ? { ...s, url: u } : s)));
              if (packageId && slide.id) {
                run(
                  () => removePackageImage({ id: slide.id!, packageId })
                    .then(() => addPackageImage({ packageId, url: u })),
                  'That picture could not be replaced.',
                );
              }
            }}
            onCleared={() => remove(at)}
            position={slide.position}
            onPositionChange={(p) => place(at, p)}
          />
        </div>
      )}

      {/* The strip: the whole set, in order, each at its own crop. Click one
          to put it on the stage. The adder is the last tile, so choosing the
          first picture and the twentieth are the same gesture. */}
      <div className="q-strip" role="listbox" aria-label="Pictures, in order">
        {slides.map((s, i) => (
          <button
            key={s.id ?? s.url}
            type="button"
            role="option"
            aria-selected={i === at}
            aria-label={i === 0 ? 'Cover' : `Picture ${i + 1}`}
            className={i === at ? 'q-strip-thumb q-strip-thumb-on' : 'q-strip-thumb'}
            style={{ backgroundImage: `url(${s.url})`, backgroundPosition: s.position ?? '50% 50%' }}
            disabled={disabled}
            onClick={() => setSelected(i)}
          >
            {i === 0 && <span className="q-strip-cover">Cover</span>}
          </button>
        ))}
        {!full && slides.length > 0 && (
          <div className="q-strip-add">
            <ImageUpload
              url={null}
              folder="packages"
              label="picture"
              maxEdge={2400}
              disabled={disabled || isPending}
              onUploaded={add}
            />
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

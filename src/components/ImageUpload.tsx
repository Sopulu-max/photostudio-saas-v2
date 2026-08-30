'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getStudioAssetUploadTarget, getPublicUrlForStudioAsset } from '@/kernel/organizations';
import { prepareImage, readableBytes } from './prepareImage';

/**
 * Pick an image, put it in the studio's bucket, hand back the URL.
 *
 * WHY THIS IS ONE COMPONENT. Every upload in this app is the same four steps —
 * pick a file, cut it down to the size it will be shown at, put it somewhere
 * scoped to the studio, hand back a public URL — and they had been written out
 * separately for the studio logo and for a contact avatar, each with its own
 * invented size limit and its own wording when a file was turned away. What
 * differs between them is not the uploading; it is what happens to the URL
 * afterwards, and that is the only thing a caller passes.
 *
 * A LABEL OPENS THE FILE DIALOG, NOT A CLICK HANDLER. The first version was a
 * button whose onClick called .click() on a `hidden` input — the pattern this
 * app already used twice. Nothing reached storage. A display:none input is the
 * known weak spot in that pattern: browsers differ on whether a synthetic click
 * on one is allowed to open a file dialog, and when it is refused it is refused
 * silently, so there is nothing to see and nothing to catch.
 *
 * A label pointing at the input needs no JavaScript at all. Clicking it is a
 * native activation of the control, which every browser honours, and the input
 * is visually hidden by clipping rather than by display:none so it stays a real
 * focusable control for a keyboard.
 *
 * AND FAILURES ARE SHOWN, NOT ALERTED. An alert can be suppressed by the
 * browser and says nothing once dismissed; the message belongs under the
 * control it is about.
 *
 * IT CAN BE DRAGGED INTO POSITION. A cover is drawn 16:9 on a card and 3:1
 * across a page, and almost no photograph is either of those shapes — so
 * something is always cropped away, and a centred crop is right only by
 * accident. A portrait framed the way portraits are framed loses the face
 * first, which is the one thing on it that mattered.
 *
 * The drag tracks the pointer exactly rather than approximately, which is the
 * difference between placing a photograph and fighting one. That needs the
 * image's real dimensions: under background-size: cover the picture is scaled
 * to the larger of the two ratios, and what hangs outside the frame — the
 * overflow — is the whole of what a drag can move. A pixel of pointer is a
 * pixel of overflow, so an axis with nothing hanging over does not move at all,
 * which is also correct.
 *
 * NOTHING IS REFUSED FOR BEING LARGE. This used to turn away anything over 5MB
 * — a number nothing required, since the buckets carry no size limit at all,
 * invented in one component and copied into the next two. A studio exporting
 * from Lightroom routinely produces 15 to 40MB, so the app was asking a
 * photography business to shrink its own photographs before it would accept
 * them. They are resized here instead, to the largest size the screen they
 * appear on can actually resolve. See prepareImage.
 */
export function ImageUpload({
  url,
  onUploaded,
  onCleared,
  folder = 'studio',
  label = 'image',
  aspect = '16 / 9',
  maxEdge,
  position,
  onPositionChange,
  disabled,
}: {
  url: string | null;
  onUploaded: (url: string) => void;
  /** Given when the image can be taken off again. Absent means it cannot. */
  onCleared?: () => void;
  /** Which shelf of the studio's bucket this belongs on. */
  folder?: string;
  /** What to call it when there is none yet, in the middle of a sentence. */
  label?: string;
  aspect?: string;
  /**
   * The longest edge worth keeping, in pixels.
   *
   * Set by whoever knows how big the picture will ever be drawn — a cover
   * spanning a page needs far more than a face in a 40px circle, and every
   * pixel past what a screen can resolve is bytes spent on detail nobody sees.
   */
  maxEdge?: number;
  /** A CSS background-position. Absent or null means centred. */
  position?: string | null;
  /**
   * Given when the picture may be dragged into place.
   *
   * Its presence is what turns the frame into a drag surface, so a caller with
   * nowhere to store a position simply gets a picture that cannot be moved
   * rather than one that moves and forgets.
   */
  onPositionChange?: (position: string) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const frame = useRef<HTMLDivElement | null>(null);
  const natural = useRef<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const movable = Boolean(url && onPositionChange && !disabled);

  // The picture's own dimensions, which are what a cover crop is computed from.
  useEffect(() => {
    natural.current = null;
    if (!url) return;
    const img = new Image();
    img.onload = () => { natural.current = { w: img.naturalWidth, h: img.naturalHeight }; };
    img.src = url;
  }, [url]);

  const shown = live ?? position ?? '50% 50%';
  const parse = (p: string) => {
    const [x, y] = p.split(/\s+/);
    return { x: parseFloat(x) || 50, y: parseFloat(y ?? x) || 50 };
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!movable) return;
    const at = parse(shown);
    drag.current = { x: e.clientX, y: e.clientY, px: at.x, py: at.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const box = frame.current?.getBoundingClientRect();
    const nat = natural.current;
    if (!d || !box || !nat) return;

    /*
     * background-size: cover scales to the LARGER ratio, so exactly one axis
     * usually overflows. What hangs outside is the whole of what a drag can
     * move, and a percentage position is a fraction of precisely that — so
     * dividing the pointer delta by the overflow makes the picture keep pace
     * with the pointer instead of drifting behind or racing ahead.
     */
    const scale = Math.max(box.width / nat.w, box.height / nat.h);
    const overX = nat.w * scale - box.width;
    const overY = nat.h * scale - box.height;

    // Dragging right shows more of the LEFT of the picture, which is a smaller
    // percentage — hence the subtraction.
    const x = overX > 0.5 ? d.px - ((e.clientX - d.x) / overX) * 100 : d.px;
    const y = overY > 0.5 ? d.py - ((e.clientY - d.y) / overY) * 100 : d.py;
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    setLive(`${clamp(x).toFixed(1)}% ${clamp(y).toFixed(1)}%`);
  };

  // Told once, at the end. A position saved on every pointer move would be one
  // write per frame of a drag.
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    if (live && onPositionChange) onPositionChange(live);
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setProblem(null);
    setSaved(null);

    setBusy(true);
    try {
      // Resized before anything is asked of the network, so what travels is
      // what will be shown rather than what came off the camera.
      const prepared = await prepareImage(file, { maxEdge });
      const { bucket, path } = await getStudioAssetUploadTarget(prepared.file.name, folder);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, prepared.file);
      if (error) throw new Error(error.message);
      onUploaded(await getPublicUrlForStudioAsset(path));
      setSaved(
        prepared.resized
          ? `Resized from ${readableBytes(prepared.originalBytes)} to ${readableBytes(prepared.file.size)}.`
          : null,
      );
    } catch (err: any) {
      // Said in full. A studio that cannot upload needs to know whether it is
      // the file, the network or the studio's own permissions.
      setProblem(err?.message ? `Upload failed: ${err.message}` : 'Upload failed.');
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  return (
    <div className="q-stack q-stack-sm">
      {/*
        * A frame that is a label while empty and a drag surface once filled.
        *
        * They cannot be the same element: a label opens the file dialog on
        * click, and a drag ends in a click. So once there is a picture to
        * place, choosing a different one moves to the Replace control below and
        * the frame's whole job is placing this one.
        */}
      {movable ? (
        <div
          ref={frame}
          className="q-imagepick q-imagepick-filled q-imagepick-movable"
          style={{ aspectRatio: aspect, backgroundImage: `url(${url})`, backgroundPosition: shown }}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag the picture to choose what shows"
        />
      ) : (
        <label
          htmlFor={inputId}
          className={url ? 'q-imagepick q-imagepick-filled' : 'q-imagepick'}
          style={{
            aspectRatio: aspect,
            backgroundImage: url ? `url(${url})` : undefined,
            backgroundPosition: url ? shown : undefined,
          }}
        >
          {!url && <span className="q-meta-sm">{busy ? 'Uploading…' : `Add a ${label}`}</span>}
        </label>
      )}

      {/* Outside both, so the control the label points at survives the frame
          changing from one to the other. */}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="q-visually-hidden"
        disabled={disabled || busy}
        onChange={pick}
      />

      {movable && <span className="q-meta-sm">Drag the picture to choose what shows.</span>}

      {url && onCleared && (
        <div className="q-row q-row-sm">
          <label htmlFor={inputId} className="q-btn q-btn-ghost q-btn-xs">
            {busy ? 'Uploading…' : 'Replace'}
          </label>
          <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={busy} onClick={onCleared}>
            Remove
          </button>
        </div>
      )}

      {problem && <span className="q-meta-sm q-text-danger">{problem}</span>}
      {saved && !problem && <span className="q-meta-sm">{saved}</span>}
    </div>
  );
}

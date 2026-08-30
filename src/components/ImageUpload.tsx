'use client';

import React, { useId, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getStudioAssetUploadTarget, getPublicUrlForStudioAsset } from '@/kernel/organizations';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Pick an image, put it in the studio's bucket, hand back the URL.
 *
 * WHY THIS IS ONE COMPONENT. Every upload in this app is the same five steps —
 * pick a file, refuse what is not an image, refuse what is too big, put it
 * somewhere scoped to the studio, hand back a public URL — and they had been
 * written out separately for the studio logo and for a contact's avatar, each
 * with its own idea of the size limit and its own wording when a file was
 * refused. What differs between them is not the uploading; it is what happens
 * to the URL afterwards, and that is the only thing a caller passes.
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
 */
export function ImageUpload({
  url,
  onUploaded,
  onCleared,
  folder = 'studio',
  label = 'image',
  aspect = '16 / 9',
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
  disabled?: boolean;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setProblem(null);

    if (!file.type.startsWith('image/')) { setProblem('That is not an image file.'); input.value = ''; return; }
    if (file.size > MAX_BYTES) { setProblem('Images have to be under 5MB.'); input.value = ''; return; }

    setBusy(true);
    try {
      const { bucket, path } = await getStudioAssetUploadTarget(file.name, folder);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw new Error(error.message);
      onUploaded(await getPublicUrlForStudioAsset(path));
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
      <label
        htmlFor={inputId}
        className={url ? 'q-imagepick q-imagepick-filled' : 'q-imagepick'}
        style={{ aspectRatio: aspect, backgroundImage: url ? `url(${url})` : undefined }}
      >
        {!url && <span className="q-meta-sm">{busy ? 'Uploading…' : `Add a ${label}`}</span>}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="q-visually-hidden"
          disabled={disabled || busy}
          onChange={pick}
        />
      </label>

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
    </div>
  );
}

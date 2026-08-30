'use client';

import React, { useRef, useState } from 'react';
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
 * refused. A third copy for package covers would have made three.
 *
 * What differs between them is not the uploading. It is what happens to the URL
 * afterwards: a logo goes into a form that saves later, an avatar is written to
 * its contact immediately. That difference is the caller's, and it is the only
 * thing the caller passes.
 *
 * The preview is the control. There is nothing to press but the image itself —
 * a picture is what you are choosing, so a picture is what you click, and an
 * empty one says what it wants.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Pick an image file.'); return; }
    if (file.size > MAX_BYTES) { alert('Keep it under 5MB.'); return; }

    setBusy(true);
    try {
      const { bucket, path } = await getStudioAssetUploadTarget(file.name, folder);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw new Error(error.message);
      onUploaded(await getPublicUrlForStudioAsset(path));
    } catch (err: any) {
      alert(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="q-stack q-stack-sm">
      <button
        type="button"
        className={url ? 'q-imagepick q-imagepick-filled' : 'q-imagepick'}
        style={{ aspectRatio: aspect, backgroundImage: url ? `url(${url})` : undefined }}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {!url && <span className="q-meta-sm">{busy ? 'Uploading…' : `Add a ${label}`}</span>}
      </button>

      {url && onCleared && (
        <div className="q-row q-row-sm">
          <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
            Replace
          </button>
          <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={busy} onClick={onCleared}>
            Remove
          </button>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}

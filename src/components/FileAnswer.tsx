'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * A file handed over as the answer to a question.
 *
 * The value is the PATH the server put it at — that is what the answer
 * stores, and what the studio reads back. The picture itself is shown from
 * the browser's own copy while the visitor is still on the page, which is why
 * `onPreview` exists: the frame preview wants the image now, not after a
 * round trip to storage and back, and the client already has the bytes.
 *
 * Uploads the moment a file is chosen rather than with the form, so the
 * answer is a path by the time the form submits and the bytes never ride
 * along inside the booking. `upload` is passed in because the server action
 * that does it belongs to the page, not to this control.
 */
export function FileAnswer({
  value,
  onChange,
  onPreview,
  upload,
  accept = 'image/*,application/pdf',
  disabled,
  hint,
}: {
  value: string;
  onChange: (path: string) => void;
  /** A local object URL for the chosen file while it is an image; null when cleared. */
  onPreview?: (url: string | null, name: string | null) => void;
  upload: (formData: FormData) => Promise<{ path: string; name: string }>;
  accept?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  // Whatever object URL is live is released when it stops being shown.
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const take = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    const isImage = file.type.startsWith('image/');
    const local = isImage ? URL.createObjectURL(file) : null;
    setThumb(local);
    setName(file.name);
    onPreview?.(local, file.name);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { path } = await upload(fd);
      onChange(path);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'That file did not upload. Try again.');
      setThumb(null);
      setName(null);
      onPreview?.(null, null);
      onChange('');
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setThumb(null);
    setName(null);
    setError(null);
    onPreview?.(null, null);
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const has = !!value || busy;

  return (
    <div className="q-stack q-stack-sm">
      <label
        className={`q-file${has ? ' q-file-has' : ''}${over ? ' q-file-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !has) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (disabled || has) return;
          take(e.dataTransfer.files?.[0]);
        }}
      >
        {!has && (
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={disabled}
            onChange={(e) => take(e.target.files?.[0])}
          />
        )}
        {thumb ? (
          <img className="q-file-thumb" src={thumb} alt="" />
        ) : (
          <span className="q-file-thumb" aria-hidden="true" />
        )}
        <span className="q-file-body">
          {has ? (
            <>
              <span className="q-file-name">{name || value.split('/').pop()}</span>
              <span className={`q-file-hint${busy ? ' q-file-busy' : ''}`}>
                {busy ? 'Uploading…' : 'Uploaded'}
              </span>
            </>
          ) : (
            <>
              <span className="q-file-name">Choose a file</span>
              <span className="q-file-hint">{hint ?? 'Or drop it here. Pictures or a PDF, up to 15 MB.'}</span>
            </>
          )}
        </span>
        {has && !busy && !disabled && (
          <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={clear}>
            Replace
          </button>
        )}
      </label>
      {error && <span className="q-meta-sm q-danger">{error}</span>}
    </div>
  );
}

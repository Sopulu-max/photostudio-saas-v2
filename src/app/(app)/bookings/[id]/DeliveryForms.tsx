'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast, readableError } from '@/components/Toast';
import { ConfirmButton } from '@/components/ConfirmButton';
import {
  createDelivery,
  updateDelivery,
  deleteDelivery,
  archiveDelivery,
  unarchiveDelivery,
  getUploadTarget,
  registerFile,
  removeFile,
  shareDelivery,
  unshareDelivery,
  setDeliveryFulfils,
  setDeliveryCover,
} from '@/modules/delivery/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { toast.bad(readableError(e, 'Something went wrong.')); }
    });
  return { isPending, run };
}

export function NewDeliveryForm({ bookingId }: { bookingId: string }) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  if (!open) {
    return (
      <button className="q-btn q-btn-secondary" style={{ marginTop: '16px' }} onClick={() => setOpen(true)}>
        + New delivery
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
      <input
        autoFocus
        className="q-input"
        placeholder="e.g. Final gallery"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ minWidth: '14rem' }}
      />
      <button
        className="q-btn q-btn-primary"
        aria-busy={isPending}
        disabled={isPending}
        onClick={() => title.trim() && run(() => createDelivery({ bookingId, title: title.trim() }).then(() => { setTitle(''); setOpen(false); }))}
      >
        {isPending ? 'Creating…' : 'Create'}
      </button>
      <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
    </div>
  );
}

/** Rename, archive/restore, and delete — a delivery was write-once until now. */
export function DeliveryActions({
  deliveryId,
  bookingId,
  title,
  status,
  archived,
}: {
  deliveryId: string;
  bookingId: string;
  title: string;
  status: string;
  archived: boolean;
}) {
  const { isPending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <div className="q-row">
        <input autoFocus className="q-input" value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setValue(title); } }}
          style={{ minWidth: '12rem' }} />
        <button className="q-btn q-btn-primary q-btn-xs" aria-busy={isPending} disabled={isPending}
          onClick={() => value.trim() && run(() => updateDelivery({ deliveryId, bookingId, title: value }).then(() => setEditing(false)))}>
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setEditing(false); setValue(title); }}>Cancel</button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-stack q-stack-sm">
        <strong>Delete “{title}” for good?</strong>
        <span className="q-meta-plain">
          Its files go with it{status === 'shared' ? ", and the client's link stops working immediately" : ''}.
        </span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending}
            onClick={() => run(() => deleteDelivery({ deliveryId, bookingId }))}>
            Delete
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-row">
      <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Rename</button>
      <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
        onClick={() => run(() => archived ? unarchiveDelivery({ deliveryId, bookingId }) : archiveDelivery({ deliveryId, bookingId }))}>
        {archived ? 'Restore' : 'Archive'}
      </button>
      <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setConfirming(true)}>Delete</button>
    </div>
  );
}

export function UploadFilesButton({ deliveryId, bookingId }: { deliveryId: string; bookingId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const router = useRouter();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`${i + 1}/${files.length}`);
        const { bucket, path } = await getUploadTarget(deliveryId, file.name);
        const { error } = await supabase.storage.from(bucket).upload(path, file);
        if (error) throw new Error(`${file.name}: ${error.message}`);
        await registerFile({
          deliveryId,
          bookingId,
          storagePath: path,
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
        });
      }
      router.refresh();
    } catch (err: any) {
      toast.bad(readableError(err, 'Upload failed.'));
    } finally {
      setBusy(false);
      setProgress('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
      <button
        className="q-btn q-btn-secondary"
        style={{ fontSize: '0.8rem', padding: '5px 11px' }}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? `Uploading ${progress}…` : '+ Add files'}
      </button>
    </>
  );
}

export function RemoveFileButton({ fileId, bookingId }: { fileId: string; bookingId: string }) {
  const { isPending, run } = useAction();
  /*
   * THE ONE BARE CONTROL AMONG SEVERAL CAREFUL ONES.
   *
   * Deleting a booking opens a paragraph explaining what goes with it;
   * removing a line and deleting a delivery each ask twice. This sat on a grid
   * of thumbnails, at 0.7rem, and acted on the first click.
   *
   * It only unlinks — the asset itself survives — but that is not what the
   * operator experiences. On a delivery already shared, the picture leaves what
   * the client is looking at, and nothing in the interface puts it back. So it
   * asks, and the armed label says what actually happens rather than repeating
   * the word Remove, which was the half of it that sounded permanent.
   *
   * The inline font size went with it: q-btn-xs is the size this wanted, and a
   * measurement hard-coded onto one element cannot answer to the design.
   */
  return (
    <ConfirmButton
      className="q-btn q-btn-secondary q-btn-xs"
      disabled={isPending}
      confirmLabel="Take it out?"
      title="Take this file out of the delivery. The file itself is kept."
      onConfirm={() => run(() => removeFile({ fileId, bookingId }))}
    >
      Remove
    </ConfirmButton>
  );
}

/**
 * The image the client's gallery opens with.
 *
 * Only offered on images, because a PDF cannot be a cover. Choosing nothing is
 * valid and common — the gallery then leads with the first photograph, so this
 * is a way to overrule that rather than a field that must be filled.
 */
export function CoverButton({
  deliveryId,
  bookingId,
  deliveryAssetId,
  isCover,
}: {
  deliveryId: string;
  bookingId: string;
  deliveryAssetId: string;
  isCover: boolean;
}) {
  const { isPending, run } = useAction();

  return (
    <button
      className={`q-btn q-btn-xs ${isCover ? 'q-btn-primary' : 'q-btn-secondary'}`}
      aria-busy={isPending}
      disabled={isPending}
      title={isCover ? 'This opens the gallery. Click to clear it.' : 'Open the gallery with this image'}
      onClick={() =>
        run(() =>
          setDeliveryCover({ deliveryId, bookingId, deliveryAssetId: isCover ? null : deliveryAssetId })
        )
      }
    >
      {isCover ? 'Cover' : 'Set as cover'}
    </button>
  );
}

/**
 * Which of the booking's promises this bundle keeps. Only what was actually
 * sold is offered — a delivery can't tick off something nobody bought.
 */
export function FulfilsControl({
  deliveryId,
  bookingId,
  promised,
  fulfils,
}: {
  deliveryId: string;
  bookingId: string;
  promised: { id: string; name: string }[];
  fulfils: { id: string; name: string }[];
}) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(fulfils.map((f) => f.id));

  if (promised.length === 0) return null;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (!open) {
    return (
      <div className="q-row" style={{ marginTop: '8px' }}>
        {fulfils.length > 0 ? (
          <span className="q-meta">Covers {fulfils.map((f) => f.name).join(' · ')}</span>
        ) : (
          <span className="q-meta-sm">Not marked against anything promised</span>
        )}
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setPicked(fulfils.map((f) => f.id)); setOpen(true); }}>
          {fulfils.length > 0 ? 'Change' : 'Mark what this covers'}
        </button>
      </div>
    );
  }

  return (
    <div className="q-note q-stack q-stack-sm" style={{ marginTop: '8px' }}>
      <span className="q-meta-sm">What this delivery hands over</span>
      <div className="q-row" style={{ flexWrap: 'wrap' }}>
        {promised.map((p) => (
          <label key={p.id} className="q-row" style={{ gap: '6px' }}>
            <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="q-meta-plain">{p.name}</span>
          </label>
        ))}
      </div>
      <div className="q-row">
        <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending}
          onClick={() => run(() => setDeliveryFulfils({ deliveryId, bookingId, deliverableIds: picked }).then(() => setOpen(false)))}>
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setOpen(false); setPicked(fulfils.map((f) => f.id)); }}>Cancel</button>
      </div>
    </div>
  );
}

export function ShareControl({
  deliveryId,
  bookingId,
  status,
  shareToken,
}: {
  deliveryId: string;
  bookingId: string;
  status: string;
  shareToken: string | null;
}) {
  const { isPending, run } = useAction();
  const [copied, setCopied] = useState(false);
  // Start relative so server and first client render match — swap in the
  // full origin after mount to avoid a hydration mismatch on the input value.
  const [url, setUrl] = useState(`/gallery/${shareToken}`);
  useEffect(() => {
    if (shareToken) setUrl(`${window.location.origin}/gallery/${shareToken}`);
  }, [shareToken]);

  if (status === 'shared' && shareToken) {
    return (
      <div className="q-row">
        <input readOnly value={url} className="q-input" style={{ flex: 1, minWidth: '14rem', fontFamily: 'var(--q-font-mono)', fontSize: '0.75rem' }} />
        <button
          className="q-btn q-btn-secondary"
          style={{ fontSize: '0.8rem' }}
          onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a href={`/gallery/${shareToken}`} target="_blank" rel="noopener noreferrer" className="q-btn q-btn-secondary" style={{ fontSize: '0.8rem' }}>
          View
        </a>
        <button
          className="q-btn q-btn-secondary"
          style={{ fontSize: '0.8rem' }}
          disabled={isPending}
          onClick={() => run(() => unshareDelivery({ deliveryId, bookingId }))}
        >
          Revoke
        </button>
      </div>
    );
  }

  return (
    <button
      className="q-btn q-btn-primary"
      style={{ fontSize: '0.8rem' }}
      aria-busy={isPending}
      disabled={isPending}
      onClick={() => run(() => shareDelivery({ deliveryId, bookingId }))}
    >
      {isPending ? 'Sharing…' : 'Share with client'}
    </button>
  );
}

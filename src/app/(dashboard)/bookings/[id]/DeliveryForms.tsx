'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  createDelivery,
  getUploadTarget,
  registerFile,
  removeFile,
  shareDelivery,
  unshareDelivery,
} from '@/modules/delivery/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
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
        disabled={isPending}
        onClick={() => title.trim() && run(() => createDelivery({ bookingId, title: title.trim() }).then(() => { setTitle(''); setOpen(false); }))}
      >
        {isPending ? 'Creating…' : 'Create'}
      </button>
      <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
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
      alert(err?.message || 'Upload failed.');
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
  return (
    <button
      className="q-btn q-btn-secondary"
      style={{ fontSize: '0.7rem', padding: '2px 7px' }}
      disabled={isPending}
      onClick={() => run(() => removeFile({ fileId, bookingId }))}
    >
      Remove
    </button>
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

  if (status === 'shared' && shareToken) {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/gallery/${shareToken}` : `/gallery/${shareToken}`;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
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
      disabled={isPending}
      onClick={() => run(() => shareDelivery({ deliveryId, bookingId }))}
    >
      {isPending ? 'Sharing…' : 'Share with client'}
    </button>
  );
}

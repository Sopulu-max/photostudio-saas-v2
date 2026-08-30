'use client';

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getAvatarUploadTarget, setContactAvatar, removeContactAvatar } from '@/kernel/contacts';
import { ContactAvatar } from './ContactAvatar';

const MAX_BYTES = 5 * 1024 * 1024;

/** Photo + upload/remove controls, shared by the Client and Employee detail pages. */
export function AvatarUpload({ contactId, name, url }: { contactId: string; name: string; url: string | null }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Held before the awaits: the element is what gets reset afterwards, and
    // reaching for it through the event later is how that reset gets lost.
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Pick an image file.'); return; }
    if (file.size > MAX_BYTES) { alert('Keep it under 5MB.'); return; }

    setBusy(true);
    try {
      const { bucket, path } = await getAvatarUploadTarget(contactId, file.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw new Error(error.message);
      await setContactAvatar({ contactId, storagePath: path });
      router.refresh();
    } catch (err: any) {
      alert(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await removeContactAvatar(contactId);
      router.refresh();
    } catch (err: any) {
      alert(err?.message || 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="q-row" style={{ alignItems: 'center', gap: '14px' }}>
      <ContactAvatar name={name} url={url} size="lg" />
      <div className="q-stack q-stack-sm">
        {/*
          * A label, not a click handler on a hidden input.
          *
          * The same pattern here stopped package covers reaching storage
          * entirely: a display:none input is not focusable and browsers differ
          * on whether a synthetic click on one may open a file dialog — and
          * when it is refused it is refused silently. Clipping keeps it a real
          * control; a label pointing at it is a native activation every browser
          * honours.
          */}
        <input id={inputId} type="file" accept="image/*" className="q-visually-hidden" disabled={busy} onChange={onPick} />
        <div className="q-row">
          <label htmlFor={inputId} className="q-btn q-btn-secondary q-btn-sm">
            {busy ? 'Uploading…' : url ? 'Change photo' : '+ Add photo'}
          </label>
          {url && (
            <button className="q-btn q-btn-secondary q-btn-sm" disabled={busy} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

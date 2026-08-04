'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getAvatarUploadTarget, setContactAvatar, removeContactAvatar } from '@/kernel/contacts';
import { ContactAvatar } from './ContactAvatar';

const MAX_BYTES = 5 * 1024 * 1024;

/** Photo + upload/remove controls, shared by the Client and Employee detail pages. */
export function AvatarUpload({ contactId, name, url }: { contactId: string; name: string; url: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      if (inputRef.current) inputRef.current.value = '';
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
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
        <div className="q-row">
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Uploading…' : url ? 'Change photo' : '+ Add photo'}
          </button>
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

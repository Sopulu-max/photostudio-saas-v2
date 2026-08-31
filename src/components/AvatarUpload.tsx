'use client';

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { prepareImage } from './prepareImage';
import { getAvatarUploadTarget, setContactAvatar, removeContactAvatar } from '@/kernel/contacts';
import { ContactAvatar } from './ContactAvatar';
import { toast, readableError } from '@/components/Toast';


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

    setBusy(true);
    try {
      /*
       * 512 is the whole of it. A face is drawn at 40 pixels in a list and at
       * a little over a hundred on a profile, so anything past this is bytes
       * carrying detail that is never on screen — and refusing a 12MB portrait
       * outright, as this did, was the wrong answer to the same problem.
       */
      const prepared = await prepareImage(file, { maxEdge: 512 });
      const { bucket, path } = await getAvatarUploadTarget(contactId, prepared.file.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, prepared.file);
      if (error) throw new Error(error.message);
      await setContactAvatar({ contactId, storagePath: path });
      router.refresh();
    } catch (err: any) {
      toast.bad(readableError(err, 'Upload failed.'));
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
      toast.bad(readableError(err, 'Could not remove the photo.'));
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

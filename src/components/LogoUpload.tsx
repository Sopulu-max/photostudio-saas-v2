'use client';

import React, { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getStudioLogoUploadTarget, getPublicUrlForLogo } from '@/kernel/organizations';

const MAX_BYTES = 5 * 1024 * 1024;

/** Photo upload control for studio logos. Returns the uploaded public URL. */
export function LogoUpload({ 
  currentUrl, 
  onUploadComplete 
}: { 
  currentUrl: string | null; 
  onUploadComplete: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Pick an image file.'); return; }
    if (file.size > MAX_BYTES) { alert('Keep it under 5MB.'); return; }

    setBusy(true);
    try {
      const { bucket, path } = await getStudioLogoUploadTarget(file.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw new Error(error.message);
      
      const publicUrl = await getPublicUrlForLogo(path);
      onUploadComplete(publicUrl);
    } catch (err: any) {
      alert(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onRemove = () => {
    onUploadComplete('');
  };

  return (
    <div className="q-row" style={{ alignItems: 'center', gap: '16px', marginTop: '4px' }}>
      {currentUrl ? (
        <div style={{ width: '64px', height: '64px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', backgroundColor: 'var(--q-color-paper)', backgroundImage: `url(${currentUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      ) : (
        <div style={{ width: '64px', height: '64px', borderRadius: '6px', border: '1px dashed var(--q-color-ink-300)', backgroundColor: 'var(--q-color-ink-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-400)' }}>No Logo</span>
        </div>
      )}
      <div className="q-stack q-stack-sm">
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
        <div className="q-row" style={{ gap: '8px' }}>
          <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Uploading…' : currentUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {currentUrl && !busy && (
            <button type="button" className="q-btn q-btn-plain q-btn-sm" onClick={onRemove} style={{ color: 'var(--q-color-red)' }}>
              Remove
            </button>
          )}
        </div>
        <div className="q-meta-sm">PNG, JPG up to 5MB.</div>
      </div>
    </div>
  );
}

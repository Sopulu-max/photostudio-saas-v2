'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateStudio } from '@/kernel/organizations';

export function StudioForm({ name: initialName, slug: initialSlug }: { name: string; slug: string }) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = name.trim() !== initialName || slug.trim() !== initialSlug;
  const slugChanged = slug.trim() !== initialSlug;

  return (
    <div className="q-stack q-stack-md">
      <div className="q-field">
        <label className="q-label">Studio name</label>
        <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="q-meta-sm">Shown to clients on proposals, galleries and your booking page.</span>
      </div>

      <div className="q-field">
        <label className="q-label">Public handle</label>
        <input className="q-input q-mono" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <span className="q-meta-sm">
          Your booking links look like <code>/book/{slug || 'your-studio'}/…</code>
        </span>
      </div>

      {slugChanged && (
        <div className="q-note q-note-warn">
          <span className="q-meta-plain">
            Changing the handle breaks booking and gallery links you&rsquo;ve already sent to clients. Old links will stop working.
          </span>
        </div>
      )}

      {dirty && (
        <div className="q-row">
          <button
            className="q-btn q-btn-primary"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              try { await updateStudio({ name, slug }); router.refresh(); }
              catch (e: any) { alert(e?.message || 'Could not save.'); }
            })}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => { setName(initialName); setSlug(initialSlug); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

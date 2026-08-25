'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateStudio } from '@/kernel/organizations';

import { LogoUpload } from '@/components/LogoUpload';

export function StudioForm({ name: initialName, slug: initialSlug, logoUrl: initialLogo, coverUrl: initialCover }: { name: string; slug: string; logoUrl?: string; coverUrl?: string }) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [logoUrl, setLogoUrl] = useState(initialLogo || '');
  const [coverUrl, setCoverUrl] = useState(initialCover || '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = name.trim() !== initialName || slug.trim() !== initialSlug || logoUrl.trim() !== (initialLogo || '') || coverUrl.trim() !== (initialCover || '');
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
      
      <div className="q-field">
        <label className="q-label">Studio Logo</label>
        <LogoUpload currentUrl={logoUrl} onUploadComplete={setLogoUrl} />
        <span className="q-meta-sm" style={{ marginTop: '8px', display: 'block' }}>Shown on your storefront, dashboard, and invoices.</span>
      </div>

      <div className="q-field">
        <label className="q-label">Cover Image URL</label>
        <input className="q-input" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://example.com/cover.jpg" />
        <span className="q-meta-sm">URL of a banner image for your booking storefront.</span>
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
              try { 
                await updateStudio({ name, slug, logoUrl, coverUrl }); 
                router.refresh(); 
              }
              catch (e: any) { alert(e?.message || 'Could not save.'); }
            })}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => { setName(initialName); setSlug(initialSlug); setLogoUrl(initialLogo || ''); setCoverUrl(initialCover || ''); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

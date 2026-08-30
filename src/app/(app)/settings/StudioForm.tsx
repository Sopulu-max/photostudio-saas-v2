'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateStudio } from '@/kernel/organizations';

// The one uploader. LogoUpload was the same five steps written out separately,
// with its own size limit and its own wording when a file was refused.
import { ImageUpload } from '@/components/ImageUpload';

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
        <ImageUpload
          url={logoUrl || null}
          label="logo"
          aspect="1 / 1"
          onUploaded={setLogoUrl}
          onCleared={() => setLogoUrl('')}
        />
        <span className="q-meta-sm" style={{ marginTop: '8px', display: 'block' }}>Shown on your storefront, dashboard, and invoices.</span>
      </div>

      <div className="q-field">
        <label className="q-label">Cover Image URL</label>
        {/* Was a box to paste a URL into, which asks a studio to host its own
            cover somewhere and bring back an address. The same uploader that
            takes the logo takes this. */}
        <ImageUpload
          url={coverUrl || null}
          label="cover"
          aspect="3 / 1"
          onUploaded={setCoverUrl}
          onCleared={() => setCoverUrl('')}
        />
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

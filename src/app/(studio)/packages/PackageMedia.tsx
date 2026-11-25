'use client';

import { useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  movePackageMedia, placeToPutPackageMedia, recordPackageMedia, removePackageMedia,
  type PackageMedia as Media,
} from '@/weave/packages/media';

/**
 * What a package looks like, and how a studio changes it.
 *
 * The first frame is the cover, so moving one to the front IS setting the
 * cover — there is no separate control for it, because there is no separate
 * fact. The strip reads left to right in the order a client will meet it.
 *
 * Pictures and video together, which is the point: a studio wins work by
 * showing the work, and a package that could only hold a paragraph could not
 * show any of it.
 */
export function PackageMedia({
  packageId, media, packageName,
}: {
  packageId: string;
  media: Media[];
  packageName: string;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, start] = useTransition();
  const pick = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  /*
   * Browser straight to storage. A server action's body is capped in
   * megabytes and a video is tens of them, so the file never passes through
   * the app at all — only the note that it landed.
   */
  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    setProblem(null);
    setBusy(true);
    const supabase = createClient();
    const failed: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const { path, token } = await placeToPutPackageMedia({ packageId, name: file.name });
        const { error } = await supabase.storage
          .from('weave-files')
          .uploadToSignedUrl(path, token, file);
        if (error) throw new Error(error.message);

        await recordPackageMedia({
          packageId,
          storagePath: path,
          mimeType: file.type || null,
          sizeBytes: file.size,
        });
      } catch (err) {
        /* One bad file does not stop the rest; the ones that failed are named. */
        console.error('Package media upload failed:', file.name, err);
        failed.push(file.name);
      }
    }

    setBusy(false);
    if (pick.current) pick.current.value = '';
    if (failed.length > 0) setProblem(`Could not add ${failed.join(', ')}`);
  }

  const stuck = busy || working;

  return (
    <div className="q-pack-media">
      <div className="q-strip">
        {media.map((m, i) => (
          <figure key={m.id} className="q-frame">
            {m.kind === 'video' ? (
              /* Muted and inline so a strip of them does not shout; a studio
               * presses play when it wants to check the frame. */
              <video className="q-frame-art" src={m.url} muted playsInline controls preload="metadata" />
            ) : (
              <img className="q-frame-art" src={m.url} alt={m.caption ?? `${packageName}, ${i + 1}`} />
            )}

            {i === 0 && <span className="q-frame-first">Cover</span>}

            <figcaption className="q-frame-acts">
              <button
                type="button" className="q-icon-btn" disabled={stuck || i === 0}
                aria-label="Move earlier"
                onClick={() => run(() => movePackageMedia({ mediaId: m.id, towards: 'front' }))}
              >
                ‹
              </button>
              <button
                type="button" className="q-icon-btn" disabled={stuck || i === media.length - 1}
                aria-label="Move later"
                onClick={() => run(() => movePackageMedia({ mediaId: m.id, towards: 'back' }))}
              >
                ›
              </button>
              <button
                type="button" className="q-icon-btn" disabled={stuck}
                aria-label="Remove"
                onClick={() => run(() => removePackageMedia({ mediaId: m.id }))}
              >
                ×
              </button>
            </figcaption>
          </figure>
        ))}

        <button
          type="button" className="q-frame q-frame-add" disabled={stuck}
          onClick={() => pick.current?.click()}
        >
          {busy ? 'Adding' : 'Add pictures or video'}
        </button>
      </div>

      <input
        ref={pick} type="file" multiple accept="image/*,video/*" className="q-hidden-input"
        onChange={(event) => take(event.target.files)}
      />

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}

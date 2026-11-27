'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addElement } from '@/weave/packages/elementActions';
import { placeToPutPackageMedia, recordPackageMedia } from '@/weave/packages/media';
import type { ElementType } from '@/weave/packages/elements';
import { hangs, saySize, type Deliverable } from '@/weave/deliverables/shape';

/**
 * What can go into a package.
 *
 * Only the palette. There was a list of element rows under this, where the
 * adding, reordering and removing happened — a second copy of the package
 * written out as labels, which a studio had to read alongside the package
 * itself and keep straight. The package edits itself now, so this side has
 * one booking: hand over the things that can go on it.
 *
 * The deliverables ARE the studio's catalogue. A package points at one and
 * says how many, so nobody spells "8x10 framed" twice and the engine knows
 * whether it is posted or handed over.
 */

const TELLING: { type: ElementType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'ask', label: 'Question' },
  { type: 'session', label: 'Session' },
];

/** The deliverable drawn as the object it is, the same as on the shelf. */
function Obj({ d }: { d: Deliverable }) {
  if (d.kind === 'digital') return <span className="q-del-file" aria-hidden="true" />;
  return (
    <span
      className={`q-del-obj q-del-as-${d.shownAs ?? 'print'}`}
      aria-hidden="true"
      style={hangs(d)
        ? { ['--q-del-ratio' as string]: `${d.widthMm} / ${d.heightMm}` }
        : undefined}
    />
  );
}

export function PackageDocument({
  packageId, catalogue, working, onAddDeliverable, onAddElement,
}: {
  packageId: string;
  catalogue: Deliverable[];
  working: boolean;
  /*
   * Handed up rather than written here. The designer holds the elements, so
   * it can show the addition at once instead of both halves waiting on the
   * server and the click looking ignored.
   */
  onAddDeliverable: (d: Deliverable) => void;
  onAddElement: (type: ElementType) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const picker = useRef<HTMLInputElement | null>(null);

  /**
   * A picture, in one gesture: upload it, then place it.
   *
   * There was a separate media shelf for this once, which uploaded files into
   * a holding area that had nothing to do with the package — so a studio
   * added a photograph and watched nothing appear. The upload IS the placing.
   */
  async function takePicture(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setProblem(null);
    setAdding(true);
    try {
      const supabase = createClient();
      const { path, token } = await placeToPutPackageMedia({ packageId, name: file.name });
      const { error } = await supabase.storage
        .from('weave-files').uploadToSignedUrl(path, token, file);
      if (error) throw new Error('That file did not upload');

      const { mediaId } = await recordPackageMedia({
        packageId,
        storagePath: path,
        mimeType: file.type || null,
        sizeBytes: file.size ?? null,
      });

      await addElement({
        packageId,
        type: file.type.startsWith('video/') ? 'video' : 'picture',
        mediaId,
      });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That picture did not go on');
    } finally {
      setAdding(false);
      if (picker.current) picker.current.value = '';
    }
  }

  return (
    <div className="q-doc">
      <p className="q-label">Deliverables</p>
      {catalogue.length === 0 ? (
        <p className="q-hint">No deliverables. Added on the Deliverables page.</p>
      ) : (
        <div className="q-pal">
          {catalogue.map((d) => (
            <button
              key={d.id} type="button" className="q-pal-one"
              title={saySize(d) ?? 'File'} disabled={working}
              onClick={() => onAddDeliverable(d)}
            >
              <span className="q-pal-mark"><Obj d={d} /></span>
              <span className="q-pal-name">{d.name}</span>
            </button>
          ))}
        </div>
      )}

      <p className="q-label q-label-2">Elements</p>
      <div className="q-pal">
        {/* A photograph has to come from somewhere before it can go on. */}
        <button
          type="button" className="q-pal-one q-pal-plain"
          disabled={working || adding}
          onClick={() => picker.current?.click()}
        >
          <span className="q-pal-name">{adding ? 'Adding…' : 'Picture'}</span>
        </button>
        <input
          ref={picker} type="file" accept="image/*,video/*" className="q-sr-file"
          onChange={(event) => { void takePicture(event.target.files); }}
        />
        {TELLING.map((t) => (
          <button
            key={t.type} type="button" className="q-pal-one q-pal-plain" disabled={working}
            onClick={() => onAddElement(t.type)}
          >
            <span className="q-pal-name">{t.label}</span>
          </button>
        ))}
      </div>
      <p className="q-hint">Click to add. Change or remove it on the package.</p>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}

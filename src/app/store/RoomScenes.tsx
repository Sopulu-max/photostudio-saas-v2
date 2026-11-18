'use client';

import { useRef, useState, useTransition } from 'react';
import {
  placeToPutScene, recordScene, removeScene, setScenePlacement,
} from '@/weave/store/scenes';
import type { RoomScene } from '@/weave/store/shape';

/**
 * The rooms this studio hangs its prints in.
 *
 * Their photographs, not ours. Placing one is two facts: how wide the wall
 * really is, and where the middle of a picture goes — and the second is said
 * by pressing the spot rather than typing a number, because nobody knows
 * where 0.42 is on their own sofa.
 */
export function RoomScenes({ scenes }: { scenes: RoomScene[] }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  /*
   * Straight to storage from the browser. A room photograph is several
   * megabytes and a server action body is capped at one, so routing it
   * through the server would fail on the first real picture.
   */
  async function send(chosen: FileList | null) {
    if (!chosen?.length) return;
    setProblem(null);
    setBusy(true);
    try {
      for (const file of Array.from(chosen)) {
        const { path, token } = await placeToPutScene({ name: file.name });
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/weave-files/${path}?token=${token}`,
          { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } },
        );
        if (!res.ok) throw new Error(`${file.name} did not upload`);
        await recordScene({ storagePath: path, name: file.name.replace(/\.[^.]+$/, '') });
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not upload');
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  }

  return (
    <section className="q-stack q-stack-sm">
      <h2 className="q-section-title">Rooms to hang prints in</h2>
      <p className="q-meta">
        Your own photographs, shot square on to the wall. A client sees their
        picture hanging in them, at its real size. One without a wall width is
        shown as it is — good for a close-up of an edge or a mount.
      </p>

      {scenes.length === 0 ? (
        <p className="q-empty">No rooms yet. Until there is one, a client sees prices and no picture.</p>
      ) : (
        <div className="q-scene-grid">
          {scenes.map((scene) => (
            <div className="q-scene" key={scene.id}>
              {/*
                * Pressing the photograph is how the spot is set. The marker
                * shows where it landed, so it is adjusted by looking.
                */}
              <button
                type="button"
                className="q-scene-shot"
                disabled={working || busy}
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const x = (event.clientX - box.left) / box.width;
                  const y = (event.clientY - box.top) / box.height;
                  run(() => setScenePlacement({
                    sceneId: scene.id,
                    wallMm: scene.hangs?.wallMm ?? 2600,
                    x: Math.min(1, Math.max(0, x)),
                    y: Math.min(1, Math.max(0, y)),
                  }));
                }}
                aria-label={`Set where a print hangs in ${scene.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scene.url ?? undefined} alt={scene.name} />
                {scene.hangs && (
                  <span
                    className="q-scene-mark"
                    style={{
                      ['--q-mk-x' as string]: `${scene.hangs.x * 100}%`,
                      ['--q-mk-y' as string]: `${scene.hangs.y * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                )}
              </button>

              <span className="q-meta-sm">{scene.name}</span>

              <form
                className="q-row q-row-sm"
                onSubmit={(event) => {
                  event.preventDefault();
                  const mm = Number(new FormData(event.currentTarget).get('wallMm'));
                  if (!Number.isFinite(mm) || mm <= 0) { setProblem('How wide is that wall?'); return; }
                  run(() => setScenePlacement({
                    sceneId: scene.id, wallMm: Math.round(mm),
                    x: scene.hangs?.x ?? 0.5, y: scene.hangs?.y ?? 0.4,
                  }));
                }}
              >
                <input
                  className="q-input q-input-sm" name="wallMm" type="number" min="300" max="20000"
                  defaultValue={scene.hangs?.wallMm ?? ''} placeholder="Wall mm" disabled={working || busy}
                />
                <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || busy}>
                  Set width
                </button>
              </form>

              <div className="q-row q-row-sm">
                {scene.hangs ? (
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working || busy}
                    onClick={() => run(() => setScenePlacement({
                      sceneId: scene.id, wallMm: null, x: null, y: null,
                    }))}
                  >
                    Make it a close-up
                  </button>
                ) : <span className="q-meta-sm">A close-up. Press the photo to hang in it.</span>}
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working || busy}
                  onClick={() => run(() => removeScene({ sceneId: scene.id }))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="q-reveal-line q-scene-add">
        {busy ? 'Uploading' : 'Add a room photograph'}
        <input
          ref={picker} type="file" accept="image/*" multiple hidden disabled={busy}
          onChange={(event) => void send(event.target.files)}
        />
      </label>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </section>
  );
}

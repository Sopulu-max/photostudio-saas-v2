'use client';

import { useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { placeToPut, recordFile, chooseFile, removeFile } from '@/weave/files/actions';
import { isImage, isVideo, saySize, sayFiles, type StudioFile } from '@/weave/files/shape';

/**
 * The files on a job.
 *
 * Uploads go STRAIGHT from the browser to storage against a signed token. They
 * do not pass through the application, because a studio's upload speed should
 * not be capped by a web server and a raw file is tens of megabytes while a
 * server action's body limit is one.
 */
export function Files({ jobId, files }: { jobId: string; files: StudioFile[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState<{ done: number; of: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  async function send(chosen: FileList | null) {
    if (!chosen || chosen.length === 0) return;
    const list = Array.from(chosen);
    setProblem(null);
    setSending({ done: 0, of: list.length });

    const supabase = createClient();
    const failed: string[] = [];

    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      try {
        const { path, token } = await placeToPut({ jobId, name: file.name });
        const { error } = await supabase.storage
          .from('weave-files')
          .uploadToSignedUrl(path, token, file);
        if (error) throw new Error(error.message);

        await recordFile({
          jobId,
          storagePath: path,
          name: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
        });
      } catch (err) {
        // One bad file does not stop the card. The ones that failed are named
        // at the end, because "some failed" is not something anyone can act on.
        console.error('Upload failed:', file.name, err);
        failed.push(file.name);
      }
      setSending({ done: i + 1, of: list.length });
    }

    setSending(null);
    if (failed.length > 0) {
      setProblem(
        failed.length === 1
          ? `${failed[0]} did not go up.`
          : `${failed.length} files did not go up: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`,
      );
    }
    if (input.current) input.current.value = '';
  }

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const pictures = files.filter(isImage);
  const videos = files.filter(isVideo);
  const others = files.filter((f) => !isImage(f) && !isVideo(f));

  return (
    <section className="q-card q-stack q-stack-sm">
      <div className="q-row q-row-between">
        <h2 className="q-section-title">Files</h2>
        <span className="q-meta">{sayFiles(files)}</span>
      </div>

      <button
        type="button"
        className={over ? 'q-drop q-drop-over' : 'q-drop'}
        disabled={sending !== null}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files); }}
      >
        {sending
          ? `Sending ${sending.done} of ${sending.of}`
          : 'Drop files here, or press to choose them'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => void send(e.target.files)}
      />

      {pictures.length > 0 && (
        <div className="q-gal-grid">
          {pictures.map((f) => {
            const chosen = f.chosenBy.length > 0;
            return (
              <button
                key={f.id}
                type="button"
                className={chosen ? 'q-gal-tile q-gal-tile-chosen' : 'q-gal-tile'}
                disabled={working}
                title={f.name}
                onClick={() => run(() => chooseFile({ fileId: f.id, jobId, chosen: !chosen }))}
              >
                {f.url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.url}
                    alt={f.name}
                    onLoad={(e) => e.currentTarget.classList.add('q-gal-loaded')}
                  />
                )}
                {chosen && (
                  <span className="q-gal-mark">
                    {f.chosenBy.length === 1 ? f.chosenBy[0].name : `${f.chosenBy.length} chose`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {videos.length > 0 && (
        <div className="q-gal-grid">
          {videos.map((file) => {
            const chosen = file.chosenBy.length > 0;
            return (
              <button
                key={file.id} type="button"
                className={chosen ? 'q-gal-tile q-gal-tile-chosen' : 'q-gal-tile'}
                disabled={working} title={file.name}
                onClick={() => run(() => chooseFile({ fileId: file.id, jobId, chosen: !chosen }))}
              >
                {file.url && <video className="q-gal-video" src={file.url} muted playsInline loop autoPlay preload="metadata" />}
                {chosen && <span className="q-gal-mark">{file.chosenBy.length === 1 ? file.chosenBy[0].name : `${file.chosenBy.length} chose`}</span>}
              </button>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <div className="q-gal-files">
          {others.map((f) => (
            <div key={f.id} className="q-gal-file">
              <span className="q-gal-file-n">{f.name}</span>
              <span className="q-row q-row-sm">
                <span className="q-meta">{saySize(f.sizeBytes)}</span>
                <button
                  type="button"
                  className="q-btn q-btn-ghost q-btn-xs"
                  disabled={working}
                  onClick={() => run(() => removeFile({ fileId: f.id, jobId }))}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {problem && <p className="q-meta">{problem}</p>}
    </section>
  );
}

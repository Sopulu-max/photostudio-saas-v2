'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  clientHubForVisitor, clientHubReferenceTarget, recordClientHubReference, sendClientHubMessage,
  submitClientHubSelection, toggleClientHubSelection,
} from '@/weave/galleries/experience';
import type { ClientHubRequest, PublicGalleryFile } from '@/weave/galleries/shape';

/** A small, image-adjacent workspace; it remains inside the gallery rather than becoming a second portal. */
export function ClientHub({ token, email, files }: { token: string; email: string; files: PublicGalleryFile[] }) {
  const [requests, setRequests] = useState<ClientHubRequest[]>([]);
  const [activeId, setActiveId] = useState('');
  const [fileId, setFileId] = useState(files[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [pinX, setPinX] = useState('');
  const [pinY, setPinY] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();
  const referenceInput = useRef<HTMLInputElement>(null);
  const active = requests.find((request) => request.id === activeId) ?? null;
  const pinnedFile = files.find((file) => file.id === fileId) ?? null;

  const load = () => {
    void clientHubForVisitor({ token, email }).then((found) => {
      setRequests(found);
      setActiveId((current) => current || found[0]?.id || '');
    }).catch(() => setRequests([]));
  };

  useEffect(load, [token, email]);

  const run = (action: () => Promise<void>) => {
    setProblem(null);
    start(async () => {
      try { await action(); load(); } catch (error) { setProblem(error instanceof Error ? error.message : 'That did not work'); }
    });
  };

  const toggle = (id: string) => {
    if (!active || active.submittedAt) return;
    run(() => toggleClientHubSelection({ token, email, requestId: active.id, fileId: id, on: !active.fileIds.includes(id) }));
  };

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || !message.trim()) return;
    run(async () => {
      await sendClientHubMessage({
        token, email, requestId: active.id, body: message, fileId: fileId || null,
        parentId: replyTo, pinX: pinX ? Number(pinX) / 100 : null, pinY: pinY ? Number(pinY) / 100 : null,
      });
      setMessage(''); setPinX(''); setPinY(''); setReplyTo(null);
    });
  };

  const uploadReference = async (picked: FileList | null) => {
    const file = picked?.[0];
    if (!file || !active) return;
    setProblem(null);
    try {
      const target = await clientHubReferenceTarget({ token, email, requestId: active.id, name: file.name });
      const { error } = await createClient().storage.from('weave-files').uploadToSignedUrl(target.path, target.token, file);
      if (error) throw new Error(error.message);
      await recordClientHubReference({
        token, email, requestId: active.id, storagePath: target.path, name: file.name,
        mimeType: file.type || null, sizeBytes: file.size,
      });
      load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not upload that reference');
    } finally {
      if (referenceInput.current) referenceInput.current.value = '';
    }
  };

  if (requests.length === 0) return null;

  return (
    <section className="q-card q-stack q-stack-sm">
      <div className="q-row q-row-between">
        <h2 className="q-section-title">Client Hub</h2>
        {active?.dueOn && <span className="q-meta-sm">Due {active.dueOn}</span>}
      </div>
      <select className="q-input q-input-sm" value={activeId} onChange={(event) => setActiveId(event.target.value)} disabled={working}>
        {requests.map((request) => <option key={request.id} value={request.id}>{request.title} · {request.fileIds.length}{request.maxItems ? `/${request.maxItems}` : ''}{request.submittedAt ? ' · sent' : ''}</option>)}
      </select>
      {active && <>
        <p className="q-meta">{active.purpose} · choose, discuss, and share visual references in one place.</p>
        <div className="q-hub-files">
          {files.map((file) => (
            <button type="button" key={file.id} disabled={working || !!active.submittedAt}
              className={active.fileIds.includes(file.id) ? 'q-hub-file q-hub-file-on' : 'q-hub-file'} onClick={() => toggle(file.id)}>
              {file.name}
            </button>
          ))}
        </div>
        {!active.submittedAt && <button type="button" className="q-btn q-btn-secondary q-btn-xs q-self-start" disabled={working}
          onClick={() => run(() => submitClientHubSelection({ token, email, requestId: active.id }))}>Submit selection</button>}
        <div className="q-stack q-stack-xs">
          {active.messages.map((item) => (
            <div key={item.id} className={item.parentId ? 'q-hub-message q-hub-reply' : 'q-hub-message'}>
              <span className="q-meta-sm">{item.authorName}{item.fileId && ` · ${files.find((file) => file.id === item.fileId)?.name ?? 'picture'}`}{item.pinX !== null && item.pinY !== null && ` · pinned ${Math.round(item.pinX * 100)}%, ${Math.round(item.pinY * 100)}%`}</span>
              <span className="q-text-body">{item.body}</span>
              <button type="button" className="q-btn q-btn-ghost q-btn-xs q-self-start" disabled={working}
                onClick={() => setReplyTo(item.id)}>Reply</button>
            </div>
          ))}
        </div>
        <form className="q-stack q-stack-xs" onSubmit={send}>
          {replyTo && <div className="q-row q-row-between"><span className="q-meta-sm">Replying in thread</span><button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => setReplyTo(null)}>Cancel reply</button></div>}
          <div className="q-row q-row-sm">
            <select className="q-input q-input-sm" value={fileId} disabled={working} onChange={(event) => setFileId(event.target.value)}>
              <option value="">General note</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
            </select>
            <input className="q-input q-input-sm" type="number" min="0" max="100" placeholder="Pin X%" value={pinX} disabled={working} onChange={(event) => setPinX(event.target.value)} />
            <input className="q-input q-input-sm" type="number" min="0" max="100" placeholder="Pin Y%" value={pinY} disabled={working} onChange={(event) => setPinY(event.target.value)} />
          </div>
          {pinnedFile?.url && <button type="button" className="q-hub-pin-canvas" onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPinX(String(Math.round(((event.clientX - rect.left) / rect.width) * 100)));
            setPinY(String(Math.round(((event.clientY - rect.top) / rect.height) * 100)));
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pinnedFile.url} alt={`Choose a pin location on ${pinnedFile.name}`} />
            <span>Press the picture to place a pin</span>
          </button>}
          <textarea className="q-textarea" placeholder="Leave feedback for everyone here" value={message} disabled={working} onChange={(event) => setMessage(event.target.value)} />
          <button className="q-btn q-btn-ghost q-btn-xs q-self-start" type="submit" disabled={working || !message.trim()}>Add feedback</button>
        </form>
        <div className="q-stack q-stack-xs">
          <div className="q-row q-row-between"><span className="q-meta">Reference files</span><button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working} onClick={() => referenceInput.current?.click()}>Add reference</button></div>
          <input ref={referenceInput} type="file" hidden onChange={(event) => void uploadReference(event.target.files)} />
          {active.references.map((reference) => <a className="q-meta" key={reference.id} href={reference.url ?? undefined} target="_blank" rel="noreferrer">{reference.name}</a>)}
        </div>
      </>}
      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </section>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { commentOnGalleryAlbumSpread } from '@/weave/galleries/experience';
import type { PublicGalleryAlbum, PublicGalleryFile } from '@/weave/galleries/shape';

/** Album proofs use the delivered gallery files, so a proof never creates a second media silo. */
export function AlbumProofs({ token, email, albums, files }: {
  token: string; email: string; albums: PublicGalleryAlbum[]; files: PublicGalleryFile[];
}) {
  const [commentFor, setCommentFor] = useState('');
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();
  if (albums.length === 0) return null;
  const file = (id: string | null) => files.find((item) => item.id === id) ?? null;

  const comment = (albumId: string, spreadId: string, event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setProblem(null);
    start(async () => {
      try {
        await commentOnGalleryAlbumSpread({ token, email, albumId, spreadId, body });
        setBody(''); setCommentFor('');
      } catch (error) { setProblem(error instanceof Error ? error.message : 'Could not save that note'); }
    });
  };

  return (
    <section className="q-card q-stack q-stack-md">
      <h2 className="q-section-title">Album proofs</h2>
      {albums.map((album) => (
        <div className="q-stack q-stack-sm" key={album.id}>
          <div className="q-row q-row-between"><strong className="q-card-name">{album.name}</strong><span className="q-meta">{album.status === 'approved' ? 'Approved' : 'Ready for your review'}</span></div>
          {album.spreads.map((spread, index) => (
            <article className="q-album-spread q-stack q-stack-xs" key={spread.id}>
              <span className="q-meta-sm">Spread {index + 1}</span>
              <div className="q-album-pages">
                {[file(spread.leftFileId), file(spread.rightFileId)].map((page, pageIndex) => page ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="q-album-page" key={pageIndex} src={page.url ?? undefined} alt={page.name} />
                ) : <span className="q-album-page q-album-page-empty" key={pageIndex} aria-hidden="true" />)}
              </div>
              {spread.caption && <p className="q-meta">{spread.caption}</p>}
              {spread.comments.map((comment) => <div className={comment.parentId ? 'q-hub-message q-hub-reply' : 'q-hub-message'} key={comment.id}><span className="q-meta-sm">{comment.authorName}</span><span className="q-text-body">{comment.body}</span></div>)}
              {commentFor === spread.id ? (
                <form className="q-row q-row-sm" onSubmit={(event) => comment(album.id, spread.id, event)}>
                  <input className="q-input" autoFocus placeholder="Comment on this spread" value={body} disabled={working} onChange={(event) => setBody(event.target.value)} />
                  <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !body.trim()}>Add note</button>
                </form>
              ) : <button type="button" className="q-btn q-btn-ghost q-btn-xs q-self-start" disabled={working} onClick={() => setCommentFor(spread.id)}>Comment on this spread</button>}
            </article>
          ))}
        </div>
      ))}
      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </section>
  );
}

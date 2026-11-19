'use client';

import { useState, useTransition } from 'react';
import {
  addGallerySection, allowDownload, fillGallery, makeGallery, moveGalleryFile,
  inviteGalleryParticipant, requestGallerySelection, revokeGalleryParticipant, saveGalleryAsTemplate,
  setGalleryAccess, setGalleryCover, setGalleryDesign, setGalleryExpiry, setSectionAudience, setSectionVisibility, shareGallery,
} from '@/weave/galleries/actions';
import {
  addGalleryAlbumSpread, closeClientHubRequest, createClientHubRequest, createGalleryAlbum, setGalleryAlbumStatus,
} from '@/weave/galleries/experience';
import { sellFrom } from '@/weave/store/actions';
import { sayGallery, type GalleryActivity, type GallerySummary, type GalleryTemplate } from '@/weave/galleries/shape';
import { sayPromise, standingOfPromise } from '@/weave/packages/shape';
import type { PriceList } from '@/weave/store/shape';

type Run = (fn: () => Promise<unknown>) => void;

/** The operating controls for one gallery; every setting changes live delivery. */
function GalleryControls({
  gallery, activity, jobId, origin, lists, copied, copy, working, run,
}: {
  gallery: GallerySummary; activity: GalleryActivity | undefined; jobId: string; lists: PriceList[];
  origin: string;
  copied: string | null; copy: (token: string) => Promise<void>; working: boolean; run: Run;
}) {
  const [sectionName, setSectionName] = useState('');
  const [targetSectionId, setTargetSectionId] = useState(gallery.sections[0]?.id ?? '');
  const [expiry, setExpiry] = useState(gallery.expiresOn ?? '');
  const [code, setCode] = useState('');
  const [selectionEmail, setSelectionEmail] = useState('');
  const [selectionName, setSelectionName] = useState('');
  const [selectionMax, setSelectionMax] = useState('20');
  const [selectionDueOn, setSelectionDueOn] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'main_client' | 'guest' | 'vendor'>('guest');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [hubTitle, setHubTitle] = useState('');
  const [hubPurpose, setHubPurpose] = useState<'selection' | 'album' | 'retouch' | 'approval'>('selection');
  const [hubMax, setHubMax] = useState('');
  const [hubDueOn, setHubDueOn] = useState('');
  const [hubParticipantIds, setHubParticipantIds] = useState<string[]>([]);
  const [albumName, setAlbumName] = useState('');
  const [spreadAlbumId, setSpreadAlbumId] = useState('');
  const [spreadLeft, setSpreadLeft] = useState('');
  const [spreadRight, setSpreadRight] = useState('');

  const addSection = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await addGallerySection({ galleryId: gallery.id, jobId, name: sectionName });
      setSectionName('');
    });
  };

  const saveExpiry = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => setGalleryExpiry({ galleryId: gallery.id, jobId, expiresOn: expiry || null }));
  };

  const requireCode = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await setGalleryAccess({ galleryId: gallery.id, jobId, mode: 'code', code });
      setCode('');
    });
  };

  const requestSelection = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await requestGallerySelection({
        galleryId: gallery.id, jobId, email: selectionEmail, name: selectionName,
        maxItems: Number(selectionMax), dueOn: selectionDueOn || null,
      });
      setSelectionEmail('');
      setSelectionName('');
      setSelectionDueOn('');
    });
  };

  const invite = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      const { invite: token } = await inviteGalleryParticipant({
        galleryId: gallery.id, jobId, email: inviteEmail, role: inviteRole,
      });
      setInviteLink(`${origin}/g/${gallery.token}/access/${token}`);
      setInviteEmail('');
    });
  };

  const changeDesign = (patch: Partial<typeof gallery.design>) => {
    run(() => setGalleryDesign({ galleryId: gallery.id, jobId, design: { ...gallery.design, ...patch } }));
  };

  const createHub = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await createClientHubRequest({
        galleryId: gallery.id, jobId, title: hubTitle, purpose: hubPurpose,
        maxItems: hubMax ? Number(hubMax) : null, dueOn: hubDueOn || null, participantIds: hubParticipantIds,
      });
      setHubTitle(''); setHubMax(''); setHubDueOn(''); setHubParticipantIds([]);
    });
  };

  const createAlbum = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => { await createGalleryAlbum({ galleryId: gallery.id, jobId, name: albumName }); setAlbumName(''); });
  };

  const addSpread = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await addGalleryAlbumSpread({
        galleryId: gallery.id, jobId, albumId: spreadAlbumId, leftFileId: spreadLeft || null, rightFileId: spreadRight || null,
      });
      setSpreadLeft(''); setSpreadRight('');
    });
  };

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row q-row-sm">
        <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
          onClick={() => run(() => shareGallery({ galleryId: gallery.id, jobId, shared: !gallery.sharedAt }))}>
          {gallery.sharedAt ? 'Close it' : 'Send it'}
        </button>
        {gallery.sharedAt && (
          <button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => void copy(gallery.token)}>
            {copied === gallery.token ? 'Link copied' : 'Copy the link'}
          </button>
        )}
        <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
          onClick={() => run(() => allowDownload({ galleryId: gallery.id, jobId, may: !gallery.mayDownload }))}>
          {gallery.mayDownload ? 'Stop downloads' : 'Allow downloads'}
        </button>
      </div>

      <label className="q-row q-row-sm">
        <span className="q-meta">Sells from</span>
        <select className="q-input q-input-sm" value={gallery.priceListId ?? ''} disabled={working || lists.length === 0}
          onChange={(event) => run(() => sellFrom({ galleryId: gallery.id, jobId, priceListId: event.target.value || null }))}>
          <option value="">Nothing — just the pictures</option>
          {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
      </label>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Gallery design</summary>
        <p className="q-meta-sm">A reusable editorial treatment for this gallery and any template you save from it.</p>
        <div className="q-row q-row-sm">
          <label className="q-stack q-stack-xs">
            <span className="q-label">Palette</span>
            <select className="q-input q-input-sm" value={gallery.design.theme} disabled={working}
              onChange={(event) => changeDesign({ theme: event.target.value as typeof gallery.design.theme })}>
              <option value="paper">Paper</option>
              <option value="midnight">Midnight</option>
              <option value="cobalt">Cobalt</option>
              <option value="rose">Rose</option>
            </select>
          </label>
          <label className="q-stack q-stack-xs">
            <span className="q-label">Type</span>
            <select className="q-input q-input-sm" value={gallery.design.font} disabled={working}
              onChange={(event) => changeDesign({ font: event.target.value as typeof gallery.design.font })}>
              <option value="modern">Modern</option>
              <option value="editorial">Editorial</option>
              <option value="mono">Studio mono</option>
            </select>
          </label>
          <label className="q-stack q-stack-xs">
            <span className="q-label">Grid</span>
            <select className="q-input q-input-sm" value={gallery.design.grid} disabled={working}
              onChange={(event) => changeDesign({ grid: event.target.value as typeof gallery.design.grid })}>
              <option value="story">Story</option>
              <option value="tiles">Tiles</option>
              <option value="columns">Columns</option>
            </select>
          </label>
          <label className="q-stack q-stack-xs">
            <span className="q-label">Cover</span>
            <select className="q-input q-input-sm" value={gallery.design.coverStyle} disabled={working}
              onChange={(event) => changeDesign({ coverStyle: event.target.value as typeof gallery.design.coverStyle })}>
              <option value="single">Single image</option>
              <option value="split">Split image</option>
              <option value="filmstrip">Filmstrip</option>
            </select>
          </label>
        </div>
      </details>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Client Hub</summary>
        <p className="q-meta-sm">A named collaboration request keeps selections and feedback beside the pictures.</p>
        {gallery.hubRequests.length > 0 && gallery.hubRequests.map((request) => (
          <div className="q-row q-row-between" key={request.id}>
            <span className="q-text-body">{request.title} <span className="q-meta">· {request.purpose} · {request.submitted}/{request.collaborators} sent</span></span>
            <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
              onClick={() => run(() => closeClientHubRequest({
                galleryId: gallery.id, jobId, requestId: request.id, closed: request.status === 'open',
              }))}>
              {request.status === 'open' ? 'Close request' : 'Reopen'}
            </button>
          </div>
        ))}
        <form className="q-stack q-stack-xs" onSubmit={createHub}>
          <div className="q-row q-row-sm">
            <input className="q-input" placeholder="Request title, e.g. Album favourites" value={hubTitle}
              onChange={(event) => setHubTitle(event.target.value)} disabled={working} />
            <select className="q-input q-input-sm" value={hubPurpose} disabled={working}
              onChange={(event) => setHubPurpose(event.target.value as typeof hubPurpose)}>
              <option value="selection">Selection</option><option value="album">Album</option>
              <option value="retouch">Retouching</option><option value="approval">Approval</option>
            </select>
            <input className="q-input q-input-sm" type="number" min="1" placeholder="Maximum" value={hubMax}
              onChange={(event) => setHubMax(event.target.value)} disabled={working} />
            <input className="q-input q-input-sm" type="date" value={hubDueOn}
              onChange={(event) => setHubDueOn(event.target.value)} disabled={working} />
          </div>
          <div className="q-row q-row-sm">
            {gallery.participants.filter((participant) => participant.status === 'approved').map((participant) => (
              <label className="q-meta" key={participant.id}>
                <input type="checkbox" checked={hubParticipantIds.includes(participant.id)} disabled={working}
                  onChange={(event) => setHubParticipantIds((current) => event.target.checked
                    ? [...current, participant.id] : current.filter((id) => id !== participant.id))} /> {participant.name}
              </label>
            ))}
          </div>
          <button className="q-btn q-btn-ghost q-btn-xs q-self-start" type="submit"
            disabled={working || !hubTitle.trim() || hubParticipantIds.length === 0}>Open collaboration</button>
        </form>
      </details>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Album proofs</summary>
        {gallery.albums.map((album) => (
          <div className="q-row q-row-between" key={album.id}>
            <span className="q-text-body">{album.name} <span className="q-meta">· {album.spreads} spreads · {album.status}</span></span>
            <select className="q-input q-input-sm" value={album.status} disabled={working}
              onChange={(event) => run(() => setGalleryAlbumStatus({
                albumId: album.id, galleryId: gallery.id, jobId, status: event.target.value as typeof album.status,
              }))}>
              <option value="draft">Draft</option><option value="review">Send for review</option><option value="approved">Approved</option>
            </select>
          </div>
        ))}
        <form className="q-row q-row-sm" onSubmit={createAlbum}>
          <input className="q-input" placeholder="Name an album proof" value={albumName}
            onChange={(event) => setAlbumName(event.target.value)} disabled={working} />
          <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !albumName.trim()}>Start proof</button>
        </form>
        {gallery.albums.length > 0 && (
          <form className="q-row q-row-sm" onSubmit={addSpread}>
            <select className="q-input q-input-sm" value={spreadAlbumId} disabled={working}
              onChange={(event) => setSpreadAlbumId(event.target.value)}>
              <option value="">Choose proof</option>{gallery.albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
            </select>
            <select className="q-input q-input-sm" value={spreadLeft} disabled={working}
              onChange={(event) => setSpreadLeft(event.target.value)}>
              <option value="">Left picture</option>{gallery.members.map((file) => <option key={file.fileId} value={file.fileId}>{file.name}</option>)}
            </select>
            <select className="q-input q-input-sm" value={spreadRight} disabled={working}
              onChange={(event) => setSpreadRight(event.target.value)}>
              <option value="">Right picture</option>{gallery.members.map((file) => <option key={file.fileId} value={file.fileId}>{file.name}</option>)}
            </select>
            <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !spreadAlbumId || (!spreadLeft && !spreadRight)}>Add spread</button>
          </form>
        )}
      </details>

      <div className="q-stack q-stack-xs">
        <span className="q-meta">Sections</span>
        {gallery.sections.map((section) => (
          <div className="q-row q-row-between" key={section.id}>
            <span className="q-text-body">{section.name} <span className="q-meta">· {section.howMany}</span></span>
            <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
              onClick={() => run(() => setSectionVisibility({
                galleryId: gallery.id, jobId, sectionId: section.id, visible: !section.visibleToClients,
              }))}>
              {section.visibleToClients ? 'Hide' : 'Show'}
            </button>
            <select className="q-input q-input-sm" aria-label={`${section.name} audience`} value={section.audienceRole ?? ''}
              disabled={working || gallery.accessMode !== 'invite'} onChange={(event) => run(() => setSectionAudience({
                galleryId: gallery.id, jobId, sectionId: section.id,
                audienceRole: (event.target.value || null) as 'main_client' | 'guest' | 'vendor' | null,
              }))}>
              <option value="">Everyone with gallery access</option>
              <option value="main_client">Main client only</option>
              <option value="guest">Guests only</option>
              <option value="vendor">Vendors only</option>
            </select>
          </div>
        ))}
        <div className="q-row q-row-sm">
          <select aria-label="Section for all remaining pictures" className="q-input q-input-sm" value={targetSectionId}
            onChange={(event) => setTargetSectionId(event.target.value)} disabled={working || gallery.sections.length === 0}>
            {gallery.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
          <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working || !targetSectionId}
            onClick={() => run(() => fillGallery({ galleryId: gallery.id, jobId, sectionId: targetSectionId }))}>
            Add remaining
          </button>
        </div>
        <form className="q-row q-row-sm" onSubmit={addSection}>
          <input className="q-input q-input-sm" placeholder="Name a section" value={sectionName}
            onChange={(event) => setSectionName(event.target.value)} disabled={working} />
          <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !sectionName.trim()}>
            Add section
          </button>
        </form>
      </div>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Arrange pictures and cover</summary>
        <label className="q-row q-row-sm">
          <span className="q-meta">Cover</span>
          <select className="q-input q-input-sm" value={gallery.coverFileId ?? ''} disabled={working}
            onChange={(event) => run(() => setGalleryCover({
              galleryId: gallery.id, jobId, fileId: event.target.value || null,
            }))}>
            <option value="">No cover</option>
            {gallery.members.filter((member) => member.mimeType?.startsWith('image/'))
              .map((member) => <option key={member.fileId} value={member.fileId}>{member.name}</option>)}
          </select>
        </label>
        {gallery.members.map((member) => (
          <label className="q-row q-row-sm" key={member.fileId}>
            <span className="q-meta">{member.name}</span>
            <select className="q-input q-input-sm" value={member.sectionId} disabled={working}
              onChange={(event) => run(() => moveGalleryFile({
                galleryId: gallery.id, jobId, fileId: member.fileId, sectionId: event.target.value,
              }))}>
              {gallery.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
        ))}
      </details>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Gallery activity</summary>
        <div className="q-row q-row-sm q-meta">
          <span>{activity?.opens ?? 0} views</span>
          <span>{activity?.downloads ?? 0} downloads</span>
          <span>{activity?.comments ?? 0} comments</span>
          <span>{activity?.favourites ?? 0} favourites</span>
          <span>{activity?.collectionAdds ?? 0} collection adds</span>
          <span>{activity?.selectionsSubmitted ?? 0} selections sent</span>
          <span>{activity?.orders ?? 0} orders</span>
        </div>
        {(activity?.recent.length ?? 0) === 0 ? (
          <p className="q-empty">No client activity yet.</p>
        ) : activity?.recent.map((event) => (
          <div className="q-row q-row-between" key={event.id}>
            <span className="q-meta">{event.who ?? 'A visitor'} · {event.action.replace(/_/g, ' ')}</span>
            <span className="q-meta-sm">{new Date(event.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </div>
        ))}
      </details>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Client collections and selections</summary>
        {gallery.collections.length === 0 ? (
          <p className="q-empty">No client collections or selection requests yet.</p>
        ) : gallery.collections.map((collection) => (
          <div className="q-row q-row-between" key={collection.id}>
            <span className="q-text-body">
              {collection.name} <span className="q-meta">· {collection.ownerName} · {collection.howMany}
                {collection.maxItems ? `/${collection.maxItems}` : ''}
              </span>
            </span>
            <span className="q-meta">{collection.submittedAt ? 'Sent' : collection.kind === 'selection' ? 'Waiting' : 'Collecting'}</span>
          </div>
        ))}
        <form className="q-stack q-stack-xs" onSubmit={requestSelection}>
          <input className="q-input q-input-sm" type="email" placeholder="Client email" value={selectionEmail}
            onChange={(event) => setSelectionEmail(event.target.value)} disabled={working} />
          <input className="q-input q-input-sm" placeholder="Selection name, e.g. Album favourites" value={selectionName}
            onChange={(event) => setSelectionName(event.target.value)} disabled={working} />
          <div className="q-row q-row-sm">
            <input className="q-input q-input-sm" type="number" min="1" value={selectionMax}
              onChange={(event) => setSelectionMax(event.target.value)} disabled={working} aria-label="Maximum pictures" />
            <input className="q-input q-input-sm" type="date" value={selectionDueOn}
              onChange={(event) => setSelectionDueOn(event.target.value)} disabled={working} aria-label="Selection due date" />
            <button className="q-btn q-btn-ghost q-btn-xs" type="submit"
              disabled={working || !selectionEmail.includes('@') || !selectionName.trim() || Number(selectionMax) < 1}>
              Request selection
            </button>
          </div>
        </form>
      </details>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Client comments</summary>
        {gallery.comments.length === 0 ? (
          <p className="q-empty">No client comments yet.</p>
        ) : gallery.comments.map((comment) => (
          <div className="q-stack q-stack-xs" key={comment.id}>
            <span className="q-meta">{comment.authorName} · {comment.fileName}</span>
            <span className="q-text-body">{comment.body}</span>
          </div>
        ))}
      </details>

      <details className="q-stack q-stack-xs">
        <summary className="q-meta">Gallery access</summary>
        {gallery.participants.length === 0 ? (
          <p className="q-empty">No named participants yet.</p>
        ) : gallery.participants.map((participant) => (
          <div className="q-row q-row-between" key={participant.id}>
            <span className="q-text-body">{participant.name} <span className="q-meta">· {participant.role} · {participant.status}</span></span>
            {participant.status !== 'revoked' && (
              <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                onClick={() => run(() => revokeGalleryParticipant({
                  galleryId: gallery.id, jobId, participantId: participant.id,
                }))}>
                Revoke
              </button>
            )}
          </div>
        ))}
        <form className="q-row q-row-sm" onSubmit={invite}>
          <input className="q-input q-input-sm" type="email" placeholder="Participant email" value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)} disabled={working} />
          <select className="q-input q-input-sm" value={inviteRole} disabled={working}
            onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}>
            <option value="main_client">Main client</option>
            <option value="guest">Guest</option>
            <option value="vendor">Vendor</option>
          </select>
          <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !inviteEmail.includes('@')}>
            Make invite link
          </button>
        </form>
        {inviteLink && <span className="q-meta-sm">{inviteLink}</span>}
      </details>

      <form className="q-row q-row-sm" onSubmit={(event) => {
        event.preventDefault();
        run(async () => {
          await saveGalleryAsTemplate({ galleryId: gallery.id, jobId, name: templateName });
          setTemplateName('');
        });
      }}>
        <input className="q-input q-input-sm" placeholder="Save this structure as a template" value={templateName}
          onChange={(event) => setTemplateName(event.target.value)} disabled={working} />
        <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !templateName.trim()}>
          Save template
        </button>
      </form>

      <div className="q-stack q-stack-xs">
        <form className="q-row q-row-sm" onSubmit={saveExpiry}>
          <label className="q-meta" htmlFor={`gallery-expiry-${gallery.id}`}>Expires</label>
          <input id={`gallery-expiry-${gallery.id}`} className="q-input q-input-sm" type="date" value={expiry}
            onChange={(event) => setExpiry(event.target.value)} disabled={working} />
          <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working}>Save</button>
        </form>
        {gallery.accessMode === 'link' ? (
          <div className="q-row q-row-sm">
            <form className="q-row q-row-sm" onSubmit={requireCode}>
              <input className="q-input q-input-sm" type="password" placeholder="Set a private access code" value={code}
                onChange={(event) => setCode(event.target.value)} disabled={working} />
              <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || code.length < 6}>
                Require code
              </button>
            </form>
            <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
              onClick={() => run(() => setGalleryAccess({ galleryId: gallery.id, jobId, mode: 'invite' }))}>
              Invited people only
            </button>
          </div>
        ) : (
          <div className="q-row q-row-sm">
            <span className="q-meta">{gallery.accessMode === 'invite' ? 'Named invitations required' : 'Access code required'}</span>
            <button type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
              onClick={() => run(() => setGalleryAccess({ galleryId: gallery.id, jobId, mode: 'link' }))}>
              Use link only
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Galleries are explicit delivery promises, not a derived view of selects. */
export function Galleries({
  jobId, galleries, activity, templates, origin, lists,
}: {
  jobId: string;
  galleries: GallerySummary[];
  activity: GalleryActivity[];
  templates: GalleryTemplate[];
  origin: string;
  lists: PriceList[];
}) {
  const [name, setName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [working, start] = useTransition();

  const run: Run = (fn) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (error) {
        setProblem(error instanceof Error ? error.message : 'That did not work');
      }
    });
  };

  const make = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setProblem('A gallery needs a name.'); return; }
    run(async () => {
      await makeGallery({ jobId, name, templateId: templateId || null });
      setName('');
    });
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/g/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setProblem('Could not copy the link; it is shown above.');
    }
  };

  return (
    <section className="q-card q-stack q-stack-sm">
      <h2 className="q-section-title">Galleries</h2>
      {galleries.length === 0 ? (
        <p className="q-empty">No gallery made from this job yet.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {galleries.map((gallery) => (
            <div key={gallery.id} className="q-tile q-stack q-stack-xs">
              <div className="q-row q-row-between">
                <strong className="q-strong">{gallery.name}</strong>
                <span className={gallery.sharedAt ? 'q-meta' : 'q-meta q-warm'}>{sayGallery(gallery)}</span>
                {/*
                  * What the package promised, against what is actually in it.
                  * Derived every time — the promise is a count, never four
                  * hundred empty rows waiting to disagree with it.
                  */}
                {gallery.picturesPromised !== null && (
                  <span className={
                    standingOfPromise(gallery.howMany, gallery.picturesPromised).kind === 'over'
                      ? 'q-promise q-promise-over' : 'q-promise'
                  }>
                    {sayPromise(gallery.howMany, gallery.picturesPromised)}
                  </span>
                )}
              </div>
              {gallery.sharedAt && <span className="q-meta-sm">{origin}/g/{gallery.token}</span>}
              <GalleryControls gallery={gallery} activity={activity.find((entry) => entry.galleryId === gallery.id)} jobId={jobId} origin={origin} lists={lists}
                copied={copied} copy={copy} working={working} run={run} />
            </div>
          ))}
        </div>
      )}
      <form className="q-row q-row-sm" onSubmit={make}>
        <input className="q-input" placeholder="Name a new gallery" value={name}
          onChange={(event) => setName(event.target.value)} disabled={working} />
        {templates.length > 0 && (
          <select className="q-input q-input-sm" value={templateId} disabled={working}
            onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Start with one section</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        )}
        <button className="q-btn q-btn-secondary" type="submit" disabled={working}>
          {working ? 'Making' : 'Make one'}
        </button>
      </form>
      {problem && <p className="q-meta">{problem}</p>}
    </section>
  );
}

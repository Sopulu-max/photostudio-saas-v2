'use client';

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import {
  collectionsForVisitor, commentOnGalleryFile, createVisitorCollection, favourite, picksOf,
  prepareGalleryDownload, recordGalleryView, submitGallerySelection, toggleCollectionFile,
} from '@/weave/galleries/actions';
import { placeOrder } from '@/weave/store/actions';
import type { ClientGalleryCollection, PublicGallery } from '@/weave/galleries/shape';
import { money, orderTotal, type BasketLine, type PriceList } from '@/weave/store/shape';

const REMEMBERED = 'weave.visitor.email';

function subscribeToRememberedEmail(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function readRememberedEmail() {
  try { return window.localStorage.getItem(REMEMBERED) ?? ''; } catch { return ''; }
}

function noRememberedEmail() { return ''; }

/**
 * The client's side of a gallery: keeping pictures, and buying them.
 *
 * KEEPING AND BUYING ARE SEPARATE MODES on purpose. A tap that sometimes
 * favourites and sometimes opens a shop is a tap nobody trusts, and the two
 * answer different questions - which ones do you like, and which ones do you
 * want made.
 */
export function Viewer({
  gallery, forSale,
}: {
  gallery: PublicGallery;
  forSale: PriceList | null;
}) {
  const [email, setEmail] = useState('');
  const rememberedEmail = useSyncExternalStore(
    subscribeToRememberedEmail, readRememberedEmail, noRememberedEmail,
  );
  const visitorEmail = email || rememberedEmail;
  const [typed, setTyped] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'keep' | 'collect' | 'buy'>('keep');
  const [collections, setCollections] = useState<ClientGalleryCollection[]>([]);
  const [collectionName, setCollectionName] = useState('');
  const [collectingId, setCollectingId] = useState('');
  const [buying, setBuying] = useState<string | null>(null);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [name, setName] = useState('');
  const [shipTo, setShipTo] = useState('');
  const [note, setNote] = useState('');
  const [placed, setPlaced] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [commentFileId, setCommentFileId] = useState(gallery.files[0]?.id ?? '');
  const [commentBody, setCommentBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    if (!visitorEmail) return;
    let alive = true;
    Promise.all([
      picksOf({ token: gallery.token, email: visitorEmail }),
      collectionsForVisitor({ token: gallery.token, email: visitorEmail }),
    ])
      .then(([ids, foundCollections]) => {
        if (!alive) return;
        setPicks(new Set(ids));
        setCollections(foundCollections);
        setCollectingId((current) => current || foundCollections.find((collection) => !collection.submittedAt)?.id || '');
      })
      .catch(() => { /* no picks is the right fallback */ });
    void recordGalleryView({ token: gallery.token, email: visitorEmail });
    return () => { alive = false; };
  }, [visitorEmail, gallery.token]);

  const remember = (e: React.FormEvent) => {
    e.preventDefault();
    const value = typed.trim();
    if (!value.includes('@')) { setProblem('That does not look like an email.'); return; }
    setProblem(null);
    setEmail(value);
    try { window.localStorage.setItem(REMEMBERED, value); } catch { /* fine */ }
  };

  const toggle = (fileId: string) => {
    if (!visitorEmail) return;
    const on = !picks.has(fileId);
    // Answer the press, reconcile after. Four hundred frames on a phone cannot
    // wait on the network at every tap.
    setPicks((had) => {
      const next = new Set(had);
      if (on) next.add(fileId); else next.delete(fileId);
      return next;
    });
    setProblem(null);
    start(async () => {
      try {
        await favourite({ token: gallery.token, fileId, email: visitorEmail, on });
      } catch (err) {
        setPicks((had) => {
          const next = new Set(had);
          if (on) next.delete(fileId); else next.add(fileId);
          return next;
        });
        setProblem(err instanceof Error ? err.message : 'That pick did not save');
      }
    });
  };

  const activeCollection = collections.find((collection) => collection.id === collectingId) ?? null;
  const collectionFileIds = new Set(activeCollection?.fileIds ?? []);

  const createCollection = (event: React.FormEvent) => {
    event.preventDefault();
    if (!visitorEmail || !collectionName.trim()) return;
    setProblem(null);
    start(async () => {
      try {
        const collection = await createVisitorCollection({ token: gallery.token, email: visitorEmail, name: collectionName });
        setCollections((had) => [...had, collection]);
        setCollectingId(collection.id);
        setCollectionName('');
        setMode('collect');
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not make that collection');
      }
    });
  };

  const toggleCollected = (fileId: string) => {
    if (!visitorEmail || !activeCollection || activeCollection.submittedAt) return;
    const on = !collectionFileIds.has(fileId);
    setCollections((had) => had.map((collection) => collection.id !== activeCollection.id ? collection : {
      ...collection,
      fileIds: on ? [...collection.fileIds, fileId] : collection.fileIds.filter((id) => id !== fileId),
    }));
    setProblem(null);
    start(async () => {
      try {
        await toggleCollectionFile({
          token: gallery.token, email: visitorEmail, collectionId: activeCollection.id, fileId, on,
        });
      } catch (error) {
        setCollections((had) => had.map((collection) => collection.id !== activeCollection.id ? collection : {
          ...collection,
          fileIds: on ? collection.fileIds.filter((id) => id !== fileId) : [...collection.fileIds, fileId],
        }));
        setProblem(error instanceof Error ? error.message : 'That picture did not save');
      }
    });
  };

  const submitSelection = () => {
    if (!visitorEmail || !activeCollection || activeCollection.kind !== 'selection') return;
    setProblem(null);
    start(async () => {
      try {
        await submitGallerySelection({ token: gallery.token, email: visitorEmail, collectionId: activeCollection.id });
        setCollections((had) => had.map((collection) => collection.id === activeCollection.id
          ? { ...collection, submittedAt: new Date().toISOString() } : collection));
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not send your selection');
      }
    });
  };

  const download = (fileId: string) => {
    if (!visitorEmail) { setProblem('Your email is needed before a download can be prepared.'); return; }
    setProblem(null);
    setDownloadingFileId(fileId);
    start(async () => {
      try {
        const handoff = await prepareGalleryDownload({ token: gallery.token, email: visitorEmail, fileId });
        const link = document.createElement('a');
        link.href = handoff.url;
        link.download = handoff.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not prepare that download');
      } finally {
        setDownloadingFileId(null);
      }
    });
  };

  const comment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!visitorEmail || !commentFileId || !commentBody.trim()) return;
    setProblem(null);
    start(async () => {
      try {
        await commentOnGalleryFile({
          token: gallery.token, email: visitorEmail, fileId: commentFileId, body: commentBody,
        });
        setCommentBody('');
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not save that comment');
      }
    });
  };

  const products = forSale?.products ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const basketLines = basket
    .map((line) => {
      const product = productById.get(line.productId);
      const variant = line.variantId ? product?.variants.find((item) => item.id === line.variantId) ?? null : null;
      return { line, product, variant };
    })
    .filter((item): item is { line: BasketLine; product: NonNullable<typeof item.product>; variant: typeof item.variant } =>
      !!item.product && (!item.line.variantId || !!item.variant));
  const total = orderTotal(basketLines.map((x) => ({
    unitPrice: x.product.price + (x.variant?.priceDelta ?? 0), quantity: x.line.quantity,
  })));
  const currency = products[0]?.currency ?? 'NGN';

  const addToBasket = (productId: string, variantId: string | null, fileId: string | null) => {
    setBasket((had) => {
      const at = had.findIndex((line) => line.productId === productId && line.variantId === variantId && line.fileId === fileId);
      if (at === -1) return [...had, { productId, variantId, fileId, quantity: 1 }];
      const next = [...had];
      next[at] = { ...next[at], quantity: next[at].quantity + 1 };
      return next;
    });
    setBuying(null);
  };

  const order = (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorEmail) { setProblem('An email is needed to send the order.'); return; }
    setProblem(null);
    start(async () => {
      try {
        await placeOrder({
          token: gallery.token, email: visitorEmail, name, shipTo, note, lines: basket,
        });
        setBasket([]);
        setShipTo('');
        setNote('');
        setPlaced(true);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That order did not go through');
      }
    });
  };

  const fileName = (id: string | null) =>
    gallery.files.find((f) => f.id === id)?.name ?? null;
  const cover = gallery.coverFileId
    ? gallery.files.find((file) => file.id === gallery.coverFileId && (file.mimeType ?? '').startsWith('image/')) ?? null
    : null;

  return (
    <div className="q-gallery">
      <header className="q-gal-head-plain q-stack q-stack-xs">
        {cover?.url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="q-gal-cover-image" src={cover.url} alt="" />
        )}
        <span className="q-gal-studio">{gallery.studioName}</span>
        <h1 className="q-gal-title">{gallery.name}</h1>
        <p className="q-gal-sub">
          {gallery.files.length === 0
            ? 'Nothing here yet.'
            : picks.size === 0
              ? `${gallery.files.length} ${gallery.files.length === 1 ? 'picture' : 'pictures'}.`
              : `${picks.size} of ${gallery.files.length} kept.`}
        </p>
      </header>

      <main className="q-gal-main q-stack q-stack-md">
        {!visitorEmail && (
          <form className="q-card q-row q-row-sm" onSubmit={remember}>
            <input
              className="q-input" type="email"
              placeholder="Your email, to keep your picks"
              value={typed} onChange={(e) => setTyped(e.target.value)}
            />
            <button className="q-btn q-btn-primary" type="submit">Start</button>
          </form>
        )}

        {gallery.files.length > 0 && (forSale || visitorEmail) && (
          <div className="q-row q-row-sm">
            <button
              type="button"
              className={mode === 'keep' ? 'q-btn q-btn-secondary q-btn-sm' : 'q-btn q-btn-ghost q-btn-sm'}
              onClick={() => { setMode('keep'); setBuying(null); }}
            >
              Keep the ones you like
            </button>
            {visitorEmail && (
              <button
                type="button"
                className={mode === 'collect' ? 'q-btn q-btn-secondary q-btn-sm' : 'q-btn q-btn-ghost q-btn-sm'}
                onClick={() => { setMode('collect'); setBuying(null); }}
              >
                Add to a collection
              </button>
            )}
            {forSale && <button
              type="button"
              className={mode === 'buy' ? 'q-btn q-btn-secondary q-btn-sm' : 'q-btn q-btn-ghost q-btn-sm'}
              onClick={() => setMode('buy')}
            >
              Order prints
            </button>}
          </div>
        )}

        {visitorEmail && (
          <section className="q-card q-stack q-stack-xs">
            <div className="q-row q-row-between">
              <h2 className="q-section-title">Your collections</h2>
              {activeCollection && activeCollection.kind === 'selection' && !activeCollection.submittedAt && (
                <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={working} onClick={submitSelection}>
                  Send selection
                </button>
              )}
            </div>
            {collections.length > 0 && (
              <select className="q-input q-input-sm" value={collectingId} onChange={(event) => setCollectingId(event.target.value)}>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name} · {collection.fileIds.length}{collection.maxItems ? `/${collection.maxItems}` : ''}
                    {collection.submittedAt ? ' · sent' : ''}
                  </option>
                ))}
              </select>
            )}
            {activeCollection?.dueOn && <p className="q-meta">Selection due {activeCollection.dueOn}.</p>}
            <form className="q-row q-row-sm" onSubmit={createCollection}>
              <input className="q-input q-input-sm" placeholder="Name a new collection" value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)} disabled={working} />
              <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !collectionName.trim()}>
                New collection
              </button>
            </form>
          </section>
        )}

        {visitorEmail && gallery.files.length > 0 && (
          <form className="q-card q-stack q-stack-xs" onSubmit={comment}>
            <h2 className="q-section-title">Leave a comment</h2>
            <select className="q-input q-input-sm" value={commentFileId}
              onChange={(event) => setCommentFileId(event.target.value)} disabled={working}>
              {gallery.files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
            </select>
            <textarea className="q-textarea" placeholder="What would you like the studio to know?" value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)} disabled={working} />
            <button className="q-btn q-btn-ghost q-btn-xs" type="submit" disabled={working || !commentBody.trim()}>
              Add comment
            </button>
          </form>
        )}

        {gallery.files.length === 0 ? (
          <p className="q-empty-lg">The studio has not put anything in here yet.</p>
        ) : (
          <div className="q-stack q-stack-lg">
            {gallery.sections.map((section) => (
              <section key={section.id} className="q-stack q-stack-sm">
                {gallery.sections.length > 1 && <h2 className="q-gal-section-title">{section.name}</h2>}
                <div className="q-gal-grid">
                  {section.files.map((f) => {
              const kept = picks.has(f.id);
              const collected = collectionFileIds.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={(kept && mode === 'keep') || (collected && mode === 'collect')
                    ? 'q-gal-tile q-gal-tile-chosen' : 'q-gal-tile'}
                  title={f.name}
                  disabled={mode === 'keep' ? (!visitorEmail || working)
                    : mode === 'collect' ? (!visitorEmail || !activeCollection || !!activeCollection.submittedAt || working)
                      : false}
                  onClick={() => (mode === 'keep' ? toggle(f.id) : mode === 'collect' ? toggleCollected(f.id) : setBuying(f.id))}
                >
                  {f.url && (f.mimeType ?? '').startsWith('video/') ? (
                    <video className="q-gal-video" src={f.url} muted playsInline loop autoPlay preload="metadata" />
                  ) : f.url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={f.url} alt={f.name}
                      onLoad={(e) => e.currentTarget.classList.add('q-gal-loaded')}
                    />
                  )}
                  {kept && mode === 'keep' && <span className="q-gal-mark">Kept</span>}
                  {collected && mode === 'collect' && <span className="q-gal-mark">Added</span>}
                </button>
              );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {buying && forSale && (
          <section className="q-card q-stack q-stack-sm">
            <div className="q-row q-row-between">
              <h2 className="q-section-title">{fileName(buying)}</h2>
              <button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => setBuying(null)}>
                Close
              </button>
            </div>
            {products.length === 0 ? (
              <p className="q-empty">Nothing is priced yet.</p>
            ) : products.map((p) => (
              <div key={p.id} className="q-stack q-stack-xs">
                <span className="q-text-body">
                  {p.name}
                  <span className="q-meta"> &middot; {p.kind === 'digital' ? 'a file' : 'made and sent'}</span>
                </span>
                {(p.variants.length === 0 ? [{ id: null, name: null, priceDelta: 0 }] : p.variants).map((variant) => (
                  <span className="q-row q-row-between" key={variant.id ?? 'base'}>
                    <span className="q-meta">{variant.name ?? 'Standard'}</span>
                    <span className="q-row q-row-sm">
                      <strong className="q-num">{money(p.price + variant.priceDelta, p.currency)}</strong>
                      <button type="button" className="q-btn q-btn-secondary q-btn-xs"
                        onClick={() => addToBasket(p.id, variant.id, buying)}>
                        Add
                      </button>
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </section>
        )}

        {basketLines.length > 0 && (
          <section className="q-card q-stack q-stack-sm">
            <h2 className="q-section-title">Your order</h2>
            {basketLines.map(({ line, product, variant }, i) => (
              <div key={`${line.productId}-${line.variantId}-${line.fileId}-${i}`} className="q-row q-row-between">
                <span className="q-text-body">
                  {line.quantity > 1 ? `${line.quantity} × ` : ''}{product.name}
                  {variant && <span className="q-meta"> · {variant.name}</span>}
                  {fileName(line.fileId) && (
                    <span className="q-meta"> &middot; {fileName(line.fileId)}</span>
                  )}
                </span>
                <span className="q-row q-row-sm">
                  <span className="q-num">{money((product.price + (variant?.priceDelta ?? 0)) * line.quantity, product.currency)}</span>
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs"
                    onClick={() => setBasket((had) => had.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}

            <div className="q-row q-row-between">
              <span className="q-strong">Total</span>
              <strong className="q-num">{money(total, currency)}</strong>
            </div>

            <form className="q-stack q-stack-sm" onSubmit={order}>
              <input
                className="q-input" placeholder="Your name"
                value={name} onChange={(e) => setName(e.target.value)} disabled={working}
              />
              <input
                className="q-input" placeholder="Where to send it"
                value={shipTo} onChange={(e) => setShipTo(e.target.value)} disabled={working}
              />
              <input
                className="q-input" placeholder="Anything the studio should know"
                value={note} onChange={(e) => setNote(e.target.value)} disabled={working}
              />
              <button className="q-btn q-btn-primary" type="submit" disabled={working}>
                {working ? 'Sending' : 'Place the order'}
              </button>
              <p className="q-meta">
                The studio will be in touch about paying. Nothing is charged here.
              </p>
            </form>
          </section>
        )}

        {placed && basketLines.length === 0 && (
          <p className="q-empty">
            Your order is with the studio. They will be in touch about paying.
          </p>
        )}

        {gallery.mayDownload && gallery.files.length > 0 && (
          <div className="q-gal-files">
            {gallery.files.map((f) => (
              <div key={f.id} className="q-gal-file">
                <span className="q-gal-file-n">{f.name}</span>
                <button type="button" className="q-btn q-btn-ghost q-btn-xs"
                  disabled={working || downloadingFileId === f.id} onClick={() => download(f.id)}>
                  {downloadingFileId === f.id ? 'Preparing' : 'Download'}
                </button>
              </div>
            ))}
          </div>
        )}

        {problem && <p className="q-meta">{problem}</p>}
      </main>
    </div>
  );
}

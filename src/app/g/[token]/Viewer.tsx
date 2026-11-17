'use client';

import { useEffect, useState, useTransition } from 'react';
import { favourite, picksOf } from '@/weave/galleries/actions';
import { placeOrder } from '@/weave/store/actions';
import type { PublicGallery } from '@/weave/galleries/shape';
import { money, orderTotal, type BasketLine, type PriceList } from '@/weave/store/shape';

const REMEMBERED = 'weave.visitor.email';

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
  const [typed, setTyped] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'keep' | 'buy'>('keep');
  const [buying, setBuying] = useState<string | null>(null);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [name, setName] = useState('');
  const [shipTo, setShipTo] = useState('');
  const [note, setNote] = useState('');
  const [placed, setPlaced] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  useEffect(() => {
    try {
      const had = window.localStorage.getItem(REMEMBERED);
      if (had) setEmail(had);
    } catch { /* private window; it will ask again */ }
  }, []);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    picksOf({ token: gallery.token, email })
      .then((ids) => { if (alive) setPicks(new Set(ids)); })
      .catch(() => { /* no picks is the right fallback */ });
    return () => { alive = false; };
  }, [email, gallery.token]);

  const remember = (e: React.FormEvent) => {
    e.preventDefault();
    const value = typed.trim();
    if (!value.includes('@')) { setProblem('That does not look like an email.'); return; }
    setProblem(null);
    setEmail(value);
    try { window.localStorage.setItem(REMEMBERED, value); } catch { /* fine */ }
  };

  const toggle = (fileId: string) => {
    if (!email) return;
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
        await favourite({ token: gallery.token, fileId, email, on });
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

  const products = forSale?.products ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const basketLines = basket
    .map((l) => ({ line: l, product: productById.get(l.productId) }))
    .filter((x): x is { line: BasketLine; product: NonNullable<typeof x.product> } => !!x.product);
  const total = orderTotal(basketLines.map((x) => ({
    unitPrice: x.product.price, quantity: x.line.quantity,
  })));
  const currency = products[0]?.currency ?? 'NGN';

  const addToBasket = (productId: string, fileId: string | null) => {
    setBasket((had) => {
      const at = had.findIndex((l) => l.productId === productId && l.fileId === fileId);
      if (at === -1) return [...had, { productId, fileId, quantity: 1 }];
      const next = [...had];
      next[at] = { ...next[at], quantity: next[at].quantity + 1 };
      return next;
    });
    setBuying(null);
  };

  const order = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setProblem('An email is needed to send the order.'); return; }
    setProblem(null);
    start(async () => {
      try {
        await placeOrder({
          token: gallery.token, email, name, shipTo, note, lines: basket,
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

  return (
    <div className="q-gallery">
      <header className="q-gal-head-plain q-stack q-stack-xs">
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
        {!email && (
          <form className="q-card q-row q-row-sm" onSubmit={remember}>
            <input
              className="q-input" type="email"
              placeholder="Your email, to keep your picks"
              value={typed} onChange={(e) => setTyped(e.target.value)}
            />
            <button className="q-btn q-btn-primary" type="submit">Start</button>
          </form>
        )}

        {forSale && gallery.files.length > 0 && (
          <div className="q-row q-row-sm">
            <button
              type="button"
              className={mode === 'keep' ? 'q-btn q-btn-secondary q-btn-sm' : 'q-btn q-btn-ghost q-btn-sm'}
              onClick={() => { setMode('keep'); setBuying(null); }}
            >
              Keep the ones you like
            </button>
            <button
              type="button"
              className={mode === 'buy' ? 'q-btn q-btn-secondary q-btn-sm' : 'q-btn q-btn-ghost q-btn-sm'}
              onClick={() => setMode('buy')}
            >
              Order prints
            </button>
          </div>
        )}

        {gallery.files.length === 0 ? (
          <p className="q-empty-lg">The studio has not put anything in here yet.</p>
        ) : (
          <div className="q-gal-grid">
            {gallery.files.map((f) => {
              const kept = picks.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={kept && mode === 'keep' ? 'q-gal-tile q-gal-tile-chosen' : 'q-gal-tile'}
                  title={f.name}
                  disabled={mode === 'keep' ? (!email || working) : false}
                  onClick={() => (mode === 'keep' ? toggle(f.id) : setBuying(f.id))}
                >
                  {f.url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={f.url} alt={f.name}
                      onLoad={(e) => e.currentTarget.classList.add('q-gal-loaded')}
                    />
                  )}
                  {kept && mode === 'keep' && <span className="q-gal-mark">Kept</span>}
                </button>
              );
            })}
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
              <div key={p.id} className="q-row q-row-between">
                <span className="q-text-body">
                  {p.name}
                  <span className="q-meta"> &middot; {p.kind === 'digital' ? 'a file' : 'made and sent'}</span>
                </span>
                <span className="q-row q-row-sm">
                  <strong className="q-num">{money(p.price, p.currency)}</strong>
                  <button
                    type="button" className="q-btn q-btn-secondary q-btn-xs"
                    onClick={() => addToBasket(p.id, p.kind === 'digital' ? buying : buying)}
                  >
                    Add
                  </button>
                </span>
              </div>
            ))}
          </section>
        )}

        {basketLines.length > 0 && (
          <section className="q-card q-stack q-stack-sm">
            <h2 className="q-section-title">Your order</h2>
            {basketLines.map(({ line, product }, i) => (
              <div key={`${line.productId}-${line.fileId}-${i}`} className="q-row q-row-between">
                <span className="q-text-body">
                  {line.quantity > 1 ? `${line.quantity} × ` : ''}{product.name}
                  {fileName(line.fileId) && (
                    <span className="q-meta"> &middot; {fileName(line.fileId)}</span>
                  )}
                </span>
                <span className="q-row q-row-sm">
                  <span className="q-num">{money(product.price * line.quantity, product.currency)}</span>
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
                {f.url && (
                  <a className="q-btn q-btn-ghost q-btn-xs" href={f.url} download={f.name}>
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {problem && <p className="q-meta">{problem}</p>}
      </main>
    </div>
  );
}

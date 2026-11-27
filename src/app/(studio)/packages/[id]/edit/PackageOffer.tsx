'use client';

import { useState } from 'react';
import { promisesOf, type ElementType, type PackageElement } from '@/weave/packages/elements';
import { hangs, type Deliverable } from '@/weave/deliverables/shape';
import type { PackageMedia as Media } from '@/weave/packages/media';
import { money } from '@/weave/store/shape';

/**
 * The package as a client meets it — and the surface it is built on.
 *
 * There was a list of element rows beside this, which is where the editing
 * happened. It was a second copy of the package written out as labels, and
 * the studio had to read both and keep them straight. The page edits ITSELF
 * now: click what is on it, change the number, take it off.
 *
 * THE OFFER COMPOSES ITSELF. The studio chooses what is in the package, not
 * where each piece sits — the picture leads, the words follow, what is
 * received is listed. That is the order a client reads in and it is the same
 * for every package, so it is not a decision to hand to a studio.
 *
 * One line per deliverable, because a deliverable appears once in a package
 * with a count: dropping the same thing in again raises the number rather
 * than making a second entry that says the same thing.
 */

/** How many slots are drawn before the rest become a count. */
const MOST = 18;

export function PackageOffer({
  name, about, price, currency, elements, media, catalogue, working,
  onCount, onRemove, onDrop, onName, onAbout, onPrice,
}: {
  name: string;
  about: string;
  price: string;
  currency: string;
  elements: PackageElement[];
  media: Media[];
  catalogue: Deliverable[];
  working?: boolean;
  /*
   * The designer holds the elements, so changes go up to it. All three are
   * OPTIONAL, and their absence is what makes this read-only: the same
   * component shows a studio the package it has made and lets it build one,
   * because those are the same thing seen with and without the handles. A
   * second rendering of a package would be a second thing to keep right.
   */
  /** The particulars, typed on the offer itself rather than beside it. */
  onName?: (name: string) => void;
  onAbout?: (about: string) => void;
  onPrice?: (price: string) => void;
  onCount?: (elementId: string, count: number) => void;
  onRemove?: (elementId: string) => void;
  /** Something dropped from the palette. */
  onDrop?: (type: ElementType, deliverableId: string | null) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const promise = promisesOf(elements, catalogue);
  const byId = new Map(catalogue.map((d) => [d.id, d]));

  const words = elements.filter((e) => e.type === 'text' && e.body?.trim());
  const asks = elements.filter((e) => e.type === 'ask' && e.body?.trim());
  const sessions = elements.filter((e) => e.type === 'session');
  const shots = elements
    .filter((e) => (e.type === 'picture' || e.type === 'video') && e.mediaId)
    .map((e) => ({ e, m: media.find((x) => x.id === e.mediaId) }))
    .filter((x): x is { e: PackageElement; m: Media } => Boolean(x.m));

  const amount = price === '' || !Number.isFinite(Number(price))
    ? null
    : Math.round(Number(price) * 100);

  const [lead, ...rest] = shots;
  const bare = shots.length === 0 && words.length === 0 && asks.length === 0
    && promise.things.length === 0 && sessions.length === 0;

  /** Nothing can be changed unless somebody upstairs is listening. */
  const editable = Boolean(onCount && onRemove);

  /** The controls, on whatever has been clicked. */
  function Tools({ id, count }: { id: string; count?: number | null }) {
    if (!editable || picked !== id) return null;
    return (
      <span className="q-ed" onClick={(event) => event.stopPropagation()}>
        {count != null && (
          <input
            className="q-ed-n" type="number" min="1" defaultValue={count}
            aria-label="How many" disabled={working}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isInteger(n) && n > 0 && n !== count) {
                setPicked(null);
                onCount?.(id, n);
              }
            }}
          />
        )}
        <button
          type="button" className="q-ed-x" disabled={working}
          onClick={() => { setPicked(null); onRemove?.(id); }}
        >
          Remove
        </button>
      </span>
    );
  }

  const pick = (id: string) => { if (editable) setPicked(picked === id ? null : id); };

  /*
   * THE PACKAGE IS THE DROP TARGET, whole. Not a slot between two lines: the
   * offer renders by KIND — the words, then what is promised, then the
   * pictures, then the questions — so where in it something lands is not a
   * thing a studio can choose. Pretending otherwise with an insertion caret
   * would promise a freedom the page does not have.
   */
  return (
    <article
      className={over ? 'q-o q-o-over' : 'q-o'}
      onDragOver={(event) => {
        if (!onDrop) return;
        if (!event.dataTransfer.types.includes('application/x-weave-element')) return;
        /* Without this the browser refuses the drop and nothing happens. */
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={(event) => {
        /* Moving between children fires leave on the parent; ignore those. */
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        if (!onDrop) return;
        const raw = event.dataTransfer.getData('application/x-weave-element');
        setOver(false);
        if (!raw) return;
        event.preventDefault();
        try {
          const what = JSON.parse(raw) as { type: ElementType; deliverableId: string | null };
          onDrop(what.type, what.deliverableId);
        } catch {
          /* Something else was dragged onto the page. Nothing to add. */
        }
      }}
    >
      {lead && (
        <span
          className={picked === lead.e.id ? 'q-o-lead q-on' : 'q-o-lead'}
          onClick={() => pick(lead.e.id)}
        >
          {lead.m.kind === 'video'
            ? <video src={lead.m.url} muted loop playsInline />
            /* eslint-disable-next-line @next/next/no-img-element */
            : <img src={lead.m.url} alt="" />}
          <Tools id={lead.e.id} />
        </span>
      )}

      <div className="q-o-body">
        {/*
          * THE PARTICULARS ARE TYPED HERE, on the offer, not in a form beside
          * it. The name, the description and the price were a second copy of
          * what this already shows — a studio typed a name on the left and
          * watched it appear on the right — which is the exact objection that
          * removed the list of element rows from this page: "a second copy of
          * the package written out as labels, and the studio had to read both
          * and keep them straight."
          *
          * The fields carry the offer's own type and no chrome, so the page
          * still reads as the thing a client meets rather than as a form.
          */}
        {onName ? (
          <input
            className="q-o-name q-o-type"
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="Untitled package"
            aria-label="Name"
          />
        ) : (
          <h2 className="q-o-name">{name || 'Untitled package'}</h2>
        )}

        {onAbout ? (
          <input
            className="q-o-desc q-o-type"
            value={about}
            onChange={(event) => onAbout(event.target.value)}
            placeholder="A line about it"
            aria-label="Description"
          />
        ) : (
          about && <p className="q-o-desc">{about}</p>
        )}

        {onPrice ? (
          <span className="q-o-price q-o-money">
            {currency}
            <input
              className="q-o-type q-o-money-n"
              value={price}
              onChange={(event) => onPrice(event.target.value)}
              placeholder="0"
              inputMode="decimal"
              aria-label={`Price (${currency})`}
            />
          </span>
        ) : (
          amount !== null && <p className="q-o-price">{money(amount, currency)}</p>
        )}

        {words.map((e) => (
          <p
            key={e.id}
            className={picked === e.id ? 'q-o-txt q-on' : 'q-o-txt'}
            onClick={() => pick(e.id)}
          >
            {e.body}
            <Tools id={e.id} />
          </p>
        ))}

        {bare && <p className="q-o-note">Nothing in this package yet.</p>}

        {/*
          * What the client receives. Each line states itself — a number and
          * the studio's own word for the thing — so nothing above it has to
          * explain what the list is.
          */}
        {(promise.things.length > 0 || sessions.length > 0) && (
          <ul className="q-o-gets">
            {promise.things.map((t) => {
              const d = byId.get(t.deliverableId);
              return (
                <li
                  key={t.deliverableId}
                  className={picked === t.elementId ? 'q-o-get q-on' : 'q-o-get'}
                  onClick={() => pick(t.elementId)}
                >
                  <span className="q-o-get-mark">
                    {d && (d.kind === 'digital'
                      ? <span className="q-del-file" aria-hidden="true" />
                      : (
                        <span
                          className={`q-del-obj q-del-as-${d.shownAs ?? 'print'}`}
                          aria-hidden="true"
                          style={hangs(d)
                            ? { ['--q-del-ratio' as string]: `${d.widthMm} / ${d.heightMm}` }
                            : undefined}
                        />
                      ))}
                  </span>
                  <span className="q-o-get-words">
                    <span className="q-o-get-n">{t.count}</span>
                    <span className="q-o-get-name">{t.name}</span>
                  </span>
                  <span className="q-o-get-when">
                    {d?.kind === 'physical' ? 'Made after the shoot' : 'Yours after the shoot'}
                  </span>
                  <Tools id={t.elementId} count={t.count} />
                </li>
              );
            })}

            {sessions.map((e) => (
              <li
                key={e.id}
                className={picked === e.id ? 'q-o-get q-on' : 'q-o-get'}
                onClick={() => pick(e.id)}
              >
                <span className="q-o-get-mark" />
                <span className="q-o-get-words">
                  <span className="q-o-get-n">{e.count ?? 0}</span>
                  {/* The studio's own word, exactly as typed. */}
                  <span className="q-o-get-name">{e.detail?.trim() || 'Included'}</span>
                </span>
                <span className="q-o-get-when">On the day</span>
                <Tools id={e.id} count={e.count} />
              </li>
            ))}
          </ul>
        )}

        {/* Empty, because nothing has been made yet: the honest picture of
          * what has been bought and not delivered. */}
        {promise.pictures > 0 && (
          <div className="q-o-grid">
            {Array.from({ length: Math.min(promise.pictures, MOST) }, (_, i) => (
              <span key={i} className="q-o-cell" />
            ))}
            {promise.pictures > MOST && (
              <span className="q-o-cell q-o-cell-more">+{promise.pictures - MOST}</span>
            )}
          </div>
        )}

        {rest.length > 0 && (
          <div className="q-o-more-shots">
            {rest.map(({ e, m }) => (
              <span
                key={e.id}
                className={picked === e.id ? 'q-o-shot q-on' : 'q-o-shot'}
                onClick={() => pick(e.id)}
              >
                {m.kind === 'video'
                  ? <video src={m.url} muted loop playsInline />
                  /* eslint-disable-next-line @next/next/no-img-element */
                  : <img src={m.url} alt="" />}
                <Tools id={e.id} />
              </span>
            ))}
          </div>
        )}

        {/* What this package asks a client when they request it. */}
        {asks.length > 0 && (
          <div className="q-o-asks">
            {asks.map((e) => (
              <p
                key={e.id}
                className={picked === e.id ? 'q-o-ask q-on' : 'q-o-ask'}
                onClick={() => pick(e.id)}
              >
                {e.body}
                <Tools id={e.id} />
              </p>
            ))}
          </div>
        )}

      </div>
    </article>
  );
}

'use client';

import { useState, useTransition } from 'react';
import {
  addDeliverable, amendDeliverable, removeDeliverable,
} from '@/weave/deliverables/actions';
import {
  hangs, saySize,
  type Deliverable, type DeliverableKind, type ShownAs,
} from '@/weave/deliverables/shape';

/**
 * What this studio delivers, as a shelf of the things themselves.
 *
 * A list of rows told you the names and nothing else: "8×10 framed" and
 * "20×30 canvas" were the same grey rectangle with different words. Here each
 * one is DRAWN — at its true proportions, with its own material — so the
 * shelf is read at a glance the way a studio reads its own stock.
 *
 * NO COLOUR CODING. The obvious way to make tiles distinct is a different
 * hue each, and this interface does not do that: the photographs bring the
 * colour and the chrome stays out of their way. The distinction is carried by
 * SHAPE and MATERIAL instead — a frame is thick and dark, a canvas stands off
 * the wall, a print is a hairline, a file is a page. Those are the real
 * differences between these objects, so they are the ones drawn.
 */

const SHOWN: { value: ShownAs; label: string }[] = [
  { value: 'print', label: 'Print' },
  { value: 'framed', label: 'Framed' },
  { value: 'canvas', label: 'Canvas' },
];

/** Inches in, millimetres stored. A photographer says 8×10, not 203×254. */
function toMm(inches: string): number | null {
  const n = Number(inches);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 25.4);
}
function toInches(mm: number | null): string {
  if (mm === null) return '';
  const n = Math.round((mm / 25.4) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * The thing itself.
 *
 * Physical things are drawn at the proportions the studio typed, so a 5×7 and
 * a 20×30 are not the same picture. One without a size yet is drawn square
 * and says so — an honest "no size set" rather than a guess.
 */
function Thing({ d }: { d: Deliverable }) {
  if (d.kind === 'digital') {
    return <span className="q-del-file" aria-hidden="true" />;
  }
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

export function Deliverables({ deliverables }: { deliverables: Deliverable[] }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DeliverableKind>('physical');
  const [open, setOpen] = useState<string | null>(null);
  /** The one being asked about before it is removed. */
  const [sure, setSure] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const chosen = deliverables.find((d) => d.id === open) ?? null;

  return (
    <div className="q-stack q-stack-md">
      <form
        className="q-newthing"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) { setProblem('Give it a name'); return; }
          const typed = name;
          setName('');
          run(() => addDeliverable({ name: typed, kind }));
        }}
      >
        <input
          className="q-input q-newthing-name" value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Retouched image, 8×10 framed, Highlight film"
          aria-label="Name"
        />
        {/*
          * The one decision the engine acts on: handed over, or made and
          * posted. Everything else about a deliverable is the studio's words.
          */}
        <span className="q-pick">
          {(['digital', 'physical'] as DeliverableKind[]).map((k) => (
            <button
              key={k} type="button"
              className={kind === k ? 'q-pick-one q-pick-on' : 'q-pick-one'}
              onClick={() => setKind(k)}
            >
              {k === 'digital' ? 'A file' : 'An object'}
            </button>
          ))}
        </span>
        <button className="q-btn q-btn-primary" disabled={working}>Add</button>
      </form>

      {problem && <p className="q-note q-note-bad">{problem}</p>}

      {deliverables.length === 0 ? (
        <p className="q-empty">
          Nothing yet. Write down what you hand over — the images, the films,
          the prints — and packages and price lists can both point at it.
        </p>
      ) : (
        <ul className="q-shelf">
          {deliverables.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className={open === d.id ? 'q-del q-del-open' : 'q-del'}
                onClick={() => setOpen(open === d.id ? null : d.id)}
              >
                <span className="q-del-stage"><Thing d={d} /></span>
                {/* The studio's own word, exactly as typed. */}
                <span className="q-del-name">{d.name}</span>
                <span className="q-del-sub">
                  {d.kind === 'digital' ? 'File' : saySize(d) ?? 'No size set'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        * The one being worked on, under the shelf rather than inside a tile,
        * so the shelf keeps its rhythm while something is being edited.
        */}
      {chosen && (
        <div className="q-thing-tune">
          <label className="q-auth-field q-particular-wide">
            <span className="q-label">Name</span>
            <input
              className="q-input" key={`${chosen.id}-name`} defaultValue={chosen.name}
              disabled={working}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== chosen.name) {
                  run(() => amendDeliverable({ deliverableId: chosen.id, name: e.target.value }));
                }
              }}
            />
          </label>

          {chosen.kind === 'physical' && (
            <>
              <label className="q-auth-field">
                <span className="q-label">Width (in)</span>
                <input
                  className="q-input q-input-xs" key={`${chosen.id}-w`}
                  defaultValue={toInches(chosen.widthMm)} disabled={working} inputMode="decimal"
                  onBlur={(e) => run(() => amendDeliverable({
                    deliverableId: chosen.id, widthMm: toMm(e.target.value),
                  }))}
                />
              </label>
              <label className="q-auth-field">
                <span className="q-label">Height (in)</span>
                <input
                  className="q-input q-input-xs" key={`${chosen.id}-h`}
                  defaultValue={toInches(chosen.heightMm)} disabled={working} inputMode="decimal"
                  onBlur={(e) => run(() => amendDeliverable({
                    deliverableId: chosen.id, heightMm: toMm(e.target.value),
                  }))}
                />
              </label>
              <label className="q-auth-field">
                <span className="q-label">Shown as</span>
                <select
                  className="q-input" key={`${chosen.id}-s`}
                  defaultValue={chosen.shownAs ?? 'print'} disabled={working}
                  onChange={(e) => run(() => amendDeliverable({
                    deliverableId: chosen.id, shownAs: e.target.value as ShownAs,
                  }))}
                >
                  {SHOWN.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </>
          )}

          <span className="q-tune-acts">
            <button
              type="button" className="q-btn q-btn-secondary" disabled={working}
              onClick={() => run(() => amendDeliverable({
                deliverableId: chosen.id,
                kind: chosen.kind === 'digital' ? 'physical' : 'digital',
              }))}
            >
              Make {chosen.kind === 'digital' ? 'an object' : 'a file'}
            </button>
            {/*
              * Asked once before it goes. This is a catalogue other things
              * point at — a package includes it, a price list sells it — and
              * one stray click on a × used to take it away with no question
              * and nothing to undo it with. Two steps, in place, rather than
              * a dialog box over the shelf.
              */}
            {sure === chosen.id ? (
              <span className="q-sure">
                <span className="q-sure-ask">Remove {chosen.name}?</span>
                <button
                  type="button" className="q-btn q-btn-danger" disabled={working}
                  onClick={() => {
                    setSure(null); setOpen(null);
                    run(() => removeDeliverable({ deliverableId: chosen.id }));
                  }}
                >Remove</button>
                <button
                  type="button" className="q-btn q-btn-secondary" disabled={working}
                  onClick={() => setSure(null)}
                >Keep</button>
              </span>
            ) : (
              <button
                type="button" className="q-icon-btn" aria-label="Remove" disabled={working}
                onClick={() => setSure(chosen.id)}
              >×</button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

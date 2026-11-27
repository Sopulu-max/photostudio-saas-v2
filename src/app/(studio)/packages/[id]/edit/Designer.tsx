'use client';

import { useEffect, useState, useTransition } from 'react';
import { amendPackage } from '@/weave/packages/actions';
import {
  addElement, amendElement, removeElement,
} from '@/weave/packages/elementActions';
import type { Package } from '@/weave/packages/shape';
import type { PackageMedia as Media } from '@/weave/packages/media';
import type { ElementType, PackageElement } from '@/weave/packages/elements';
import type { Deliverable } from '@/weave/deliverables/shape';
import { PackageDocument } from '../../PackageDocument';
import { PackageOffer } from './PackageOffer';

/**
 * The package designer, in two halves.
 *
 * CONTROLS LEFT, THE CLIENT'S PAGE RIGHT, and the elements held HERE rather
 * than read separately by each side. When the two halves each took their own
 * copy from the server, adding something on the left could not show on the
 * right until a round trip finished — about five seconds on a dev server,
 * with nothing on screen in between. The press looked ignored, so the whole
 * thing read as broken when it was only slow.
 *
 * The server stays the authority: whenever it sends a new list, that is the
 * list. This only covers the gap between the click and the refresh.
 */
export function Designer({ pack, media, elements, catalogue }: {
  pack: Package; media: Media[]; elements: PackageElement[]; catalogue: Deliverable[];
}) {
  const [name, setName] = useState(pack.name);
  const [about, setAbout] = useState(pack.about ?? '');
  const [price, setPrice] = useState(pack.price === null ? '' : String(pack.price / 100));
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const [items, setItems] = useState(elements);
  useEffect(() => { setItems(elements); }, [elements]);

  /** Show it now, let the server confirm, put it back if it refuses. */
  const run = (next: PackageElement[], fn: () => Promise<unknown>) => {
    setProblem(null);
    setItems(next);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
        setItems(elements);
      }
    });
  };

  /** A provisional element, standing in until the server sends the real one. */
  function provisional(type: ElementType, deliverableId: string | null): PackageElement {
    return {
      id: `pending-${type}-${deliverableId ?? ''}-${items.length}`,
      packageId: pack.id,
      type,
      mode: type === 'deliverable' || type === 'session' ? 'promised' : 'shown',
      deliverableId,
      count: type === 'deliverable' ? 1 : type === 'session' ? 2 : null,
      body: type === 'ask' ? 'Your question' : type === 'text' ? '' : null,
      detail: type === 'session' ? 'Outfits' : null,
      answerKind: type === 'ask' ? 'text' : null,
      mediaId: null,
      position: items.length,
    };
  }

  function addDeliverable(d: Deliverable) {
    /*
     * The same rule the server follows: a deliverable appears once, so
     * adding it again raises the count rather than making a second line.
     * Both sides must agree, or the screen flickers back on the refresh.
     */
    const already = items.find((e) => e.type === 'deliverable' && e.deliverableId === d.id);
    const next = already
      ? items.map((e) => (e === already ? { ...e, count: (e.count ?? 0) + 1 } : e))
      : [...items, provisional('deliverable', d.id)];

    run(next, () => addElement({
      packageId: pack.id, type: 'deliverable', deliverableId: d.id,
    }));
  }

  function addElementOfType(type: ElementType) {
    run([...items, provisional(type, null)],
      () => addElement({ packageId: pack.id, type }));
  }

  /**
   * Something dragged out of the palette and dropped on the package.
   *
   * The same two acts the buttons perform, chosen by what was dropped — so a
   * deliverable raises a count rather than making a second line whether it
   * was clicked or dragged, and the two gestures cannot drift apart.
   */
  function dropped(type: ElementType, deliverableId: string | null) {
    if (type === 'deliverable' && deliverableId) {
      const d = catalogue.find((x) => x.id === deliverableId);
      if (d) addDeliverable(d);
      return;
    }
    addElementOfType(type);
  }

  function changeCount(elementId: string, count: number) {
    run(items.map((e) => (e.id === elementId ? { ...e, count } : e)),
      () => amendElement({ elementId, count }));
  }

  function takeOff(elementId: string) {
    run(items.filter((e) => e.id !== elementId),
      () => removeElement({ elementId }));
  }

  function save() {
    const amount = price === '' ? null : Number(price);
    if (!name.trim() || (amount !== null && (!Number.isFinite(amount) || amount < 0))) {
      setNotice('Enter a name and a valid price.');
      return;
    }
    setNotice(null);
    start(async () => {
      try {
        await amendPackage({
          packageId: pack.id, name, about,
          price: amount === null ? null : Math.round(amount * 100),
        });
        setNotice('Saved.');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not save package');
      }
    });
  }

  return (
    <div className="q-split">
      <section className="q-split-side">
        {/*
          * The palette, and nothing else. A form for the name, the
          * description and the price used to sit above it, which made the
          * building half of this page mostly a settings panel — and those
          * three facts were already on the offer, so a studio typed each one
          * twice over. They are typed on the offer now.
          */}
        <PackageDocument
          packageId={pack.id}
          catalogue={catalogue}
          working={working}
          onAddDeliverable={addDeliverable}
          onAddElement={addElementOfType}
        />
        {problem && <p className="q-note q-note-bad">{problem}</p>}
      </section>

      <section className="q-split-view">
        {/*
          * Saving stays explicit. A package is written while somebody is on
          * the phone about it, and a field that commits half a sentence
          * records half a sentence — the same reason a booking's notes are
          * not saved on every keystroke.
          */}
        <div className="q-o-save">
          <button className="q-btn q-btn-primary q-btn-sm" type="button"
            onClick={save} disabled={working}
          >
            {working ? 'Saving' : 'Save'}
          </button>
          {notice && <p role="status" className="q-meta">{notice}</p>}
        </div>

        <PackageOffer
          name={name} about={about} price={price} currency={pack.currency}
          elements={items} media={media} catalogue={catalogue}
          working={working}
          onName={setName}
          onAbout={setAbout}
          onPrice={setPrice}
          onCount={changeCount}
          onRemove={takeOff}
          onDrop={dropped}
        />
      </section>
    </div>
  );
}

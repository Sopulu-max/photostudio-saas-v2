'use client';

import React, { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff, Plus } from 'lucide-react';
import {
  createNote, updateNote, setNotePinned, deleteNote, type Note,
} from '@/modules/notes/interface';
import { ConfirmButton } from '@/components/ConfirmButton';
import { CatalogFilter } from '@/components/CatalogFilter';
import { toast, readableError } from '@/components/Toast';

/**
 * Keeping notes.
 *
 * A LIST BESIDE AN EDITOR, not a page per note. A note is a few lines, and
 * making somebody navigate to read four of them is the shape of a filing
 * cabinet rather than of a notebook. Choosing one on the left opens it on the
 * right; typing saves itself.
 *
 * IT SAVES AS YOU STOP TYPING, not on a button. A note nobody remembered to
 * save is a note that was never taken, and the whole value of the thing is that
 * it costs nothing to write. One second of quiet is the signal — long enough
 * not to write on every keystroke, short enough that closing the tab is safe.
 *
 * The first line stands in for a missing title, because that is what a note
 * called nothing is actually called. Forcing a title first would put a form
 * between a person and a thought.
 */
export function NotesBoard({ initial }: { initial: Note[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Note[]>(initial);
  const [openId, setOpenId] = useState<string | null>(initial[0]?.id ?? null);

  // The server is the truth; this holds what has been typed since the last save.
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const savingFor = useRef<string | null>(null);

  useEffect(() => { setNotes(initial); }, [initial]);

  const open = notes.find((n) => n.id === openId) ?? null;

  /*
   * Written one second after the typing stops.
   *
   * The timer is keyed to the note, so switching to another one while a save is
   * pending cannot land the first note's words on the second — the cleanup runs
   * on every change of either.
   */
  useEffect(() => {
    if (!open || !draft) return;
    if (draft.title === (open.title ?? '') && draft.body === open.body) return;

    const id = open.id;
    savingFor.current = id;
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          await updateNote({ id, title: draft.title, body: draft.body });
          // Locally too, so the list heading follows the words without waiting
          // for a round trip to come back.
          setNotes((prev) => prev.map((n) => (
            n.id === id ? { ...n, title: draft.title || null, body: draft.body } : n
          )));
          router.refresh();
        } catch (e) {
          toast.bad(readableError(e, 'That note could not be saved.'));
        }
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, open, router]);

  const choose = (n: Note) => {
    setOpenId(n.id);
    setDraft({ title: n.title ?? '', body: n.body });
  };

  const add = () => startTransition(async () => {
    try {
      const { noteId } = await createNote();
      // Shown immediately rather than after a refresh, so the cursor has
      // somewhere to go the moment the button is pressed.
      const now = new Date().toISOString();
      const fresh: Note = {
        id: noteId, title: null, body: '', pinned: false,
        authorName: null, createdAt: now, updatedAt: now,
      };
      setNotes((prev) => [fresh, ...prev]);
      setOpenId(noteId);
      setDraft({ title: '', body: '' });
      router.refresh();
    } catch (e) {
      toast.bad(readableError(e, 'The note could not be created.'));
    }
  });

  const pin = (n: Note) => startTransition(async () => {
    try {
      await setNotePinned({ id: n.id, pinned: !n.pinned });
      setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
      router.refresh();
    } catch (e) {
      toast.bad(readableError(e, 'That could not be changed.'));
    }
  });

  const remove = (n: Note) => startTransition(async () => {
    try {
      await deleteNote(n.id);
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      if (openId === n.id) { setOpenId(null); setDraft(null); }
      router.refresh();
    } catch (e) {
      toast.bad(readableError(e, 'The note could not be removed.'));
    }
  });

  return (
    <div className="q-stack q-stack-lg">
      <CatalogFilter
        items={notes}
        noun="note"
        kind="catalogue"
        views={false}
        /* A note has no domain and no classification — the only thing worth
           narrowing it by is its own words, which the search box already does.
           Offering an empty facet row would be furniture. */
        read={(n) => ({ name: headingOf(n), description: n.body, facet: null, tags: [] })}
        sorts={[
          { key: 'recent', label: 'Recently touched', compare: (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) },
          { key: 'oldest', label: 'Oldest first', compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
          { key: 'az', label: 'A–Z', compare: (a, b) => headingOf(a).localeCompare(headingOf(b)) },
        ]}
        extra={
          <button type="button" className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={add}>
            <Plus size={15} /> New note
          </button>
        }
      >
        {(shown) => (
          <div className="q-grid-2" style={{ alignItems: 'start', gap: '20px' }}>
            <div className="q-stack q-stack-sm">
              {shown.length === 0 && (
                <div className="q-card q-empty-lg q-stack">
                  <h3 className="q-section-title">
                    {notes.length === 0 ? 'No notes yet' : 'Nothing matches that'}
                  </h3>
                  <p className="q-meta">
                    {notes.length === 0
                      ? 'Anything the studio needs to remember that no booking, client or invoice has a place for.'
                      : 'Clear the search to see them all.'}
                  </p>
                  {notes.length === 0 && (
                    <button type="button" className="q-btn q-btn-primary" disabled={isPending} onClick={add}>
                      Write the first one
                    </button>
                  )}
                </div>
              )}

              {shown.map((n) => (
                <div
                  key={n.id}
                  className={n.id === openId ? 'q-card q-card-interactive q-card-selected' : 'q-card q-card-interactive'}
                  onClick={() => choose(n)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="q-row q-row-between">
                    <strong className="q-strong">{headingOf(n)}</strong>
                    <span className="q-row q-row-sm q-card-act" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="q-btn-ghost q-btn-xs"
                        disabled={isPending}
                        title={n.pinned ? 'Stop keeping it at the top' : 'Keep it at the top'}
                        onClick={() => pin(n)}
                      >
                        {n.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                      </button>
                      <ConfirmButton
                        className="q-btn-ghost q-btn-xs"
                        disabled={isPending}
                        confirmLabel="Delete it?"
                        title="Remove this note for good"
                        onConfirm={() => remove(n)}
                      >
                        &times;
                      </ConfirmButton>
                    </span>
                  </div>
                  {n.body.trim() && (
                    <p className="q-meta-sm q-clamp-2" style={{ marginTop: '4px' }}>{n.body}</p>
                  )}
                  <span className="q-meta-sm">{when(n.updatedAt)}{n.authorName ? ` · ${n.authorName}` : ''}</span>
                </div>
              ))}
            </div>

            <div className="q-card q-section">
              {open ? (
                <div className="q-stack q-stack-sm">
                  <input
                    className="q-input"
                    placeholder="Title (optional)"
                    value={draft?.title ?? (open.title ?? '')}
                    onChange={(e) => setDraft({ title: e.target.value, body: draft?.body ?? open.body })}
                    style={{ fontWeight: 600 }}
                  />
                  <textarea
                    className="q-textarea"
                    rows={16}
                    placeholder="Ring the framer about 20x30 stock…"
                    value={draft?.body ?? open.body}
                    onChange={(e) => setDraft({ title: draft?.title ?? (open.title ?? ''), body: e.target.value })}
                  />
                  {/* Says the thing an autosaving box has to say, or a person
                      cannot tell a saved note from a lost one. */}
                  <span className="q-meta-sm">
                    {isPending && savingFor.current === open.id ? 'Saving…' : `Saved ${when(open.updatedAt)}`}
                  </span>
                </div>
              ) : (
                <p className="q-empty">Choose a note, or start a new one.</p>
              )}
            </div>
          </div>
        )}
      </CatalogFilter>
    </div>
  );
}

/**
 * What a note is called.
 *
 * Its title, or its first line, or the honest admission that it is empty. A
 * note called nothing is called its first line — that is what a person reading
 * a list is looking for, and asking for a title before letting them type would
 * put a form between them and the thought.
 */
function headingOf(n: Note): string {
  const title = (n.title || '').trim();
  if (title) return title;
  const first = (n.body || '').split('\n').map((l) => l.trim()).find(Boolean);
  return first || 'Empty note';
}

/** Recent times read better as "today"; older ones want the date. */
function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

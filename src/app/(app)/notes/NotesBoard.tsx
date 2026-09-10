'use client';

import React, { useState, useTransition, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff, Plus, Eye, Pencil } from 'lucide-react';
import {
  createNote, updateNote, setNotePinned, deleteNote, type Note,
} from '@/modules/notes/interface';
import { plainText, taskProgress, noteStats, toggleTaskLine } from '@/kernel/markdown';
import { Markdown, TaskProgress } from '@/components/Markdown';
import { MarkdownEditor } from '@/components/MarkdownEditor';
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
 *
 * WRITE AND READ ARE THE SAME NOTE, TWICE. The body is text and its formatting
 * is a reading of that text, so the two views are not two documents that could
 * drift — they are one string, shown two ways. Which one a note opens in is
 * decided by whether it has anything in it: an empty note opens ready to type,
 * because that is the only thing anybody does with an empty note, and one with
 * words opens showing them.
 */
export function NotesBoard({ initial }: { initial: Note[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Note[]>(initial);
  const [openId, setOpenId] = useState<string | null>(initial[0]?.id ?? null);
  const [mode, setMode] = useState<'write' | 'read'>(
    () => (initial[0]?.body.trim() ? 'read' : 'write'),
  );

  // The server is the truth; this holds what has been typed since the last save.
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const savingFor = useRef<string | null>(null);

  useEffect(() => { setNotes(initial); }, [initial]);

  const open = notes.find((n) => n.id === openId) ?? null;
  const body = draft?.body ?? open?.body ?? '';
  const title = draft?.title ?? open?.title ?? '';

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
    setMode(n.body.trim() ? 'read' : 'write');
  };

  const add = () => startTransition(async () => {
    try {
      const { noteId } = await createNote();
      // Shown immediately rather than after a refresh, so the cursor has
      // somewhere to go the moment the button is pressed.
      const now = new Date().toISOString();
      const fresh: Note = {
        id: noteId, title: null, body: '', pinned: false,
        authorName: null, aboutType: null, aboutId: null,
        createdAt: now, updatedAt: now,
      };
      setNotes((prev) => [fresh, ...prev]);
      setOpenId(noteId);
      setDraft({ title: '', body: '' });
      setMode('write');
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

  /*
   * Ticking a box in the reading view is an edit like any other: it rewrites
   * that one line of the body and falls into the same save that typing does.
   * There is no separate write path for it, because there is no separate thing
   * being written — a checklist is the note's own text.
   */
  const tick = (line: number) => setDraft({ title, body: toggleTaskLine(body, line) });

  const stats = useMemo(() => noteStats(body), [body]);
  const progress = useMemo(() => taskProgress(body), [body]);

  return (
    <div className="q-stack q-stack-lg">
      <CatalogFilter
        items={notes}
        noun="note"
        kind="catalogue"
        views={false}
        /* A note has no domain and no classification — the only thing worth
           narrowing it by is its own words, which the search box already does.
           Offering an empty facet row would be furniture.

           Searched on the words rather than the marks: a person looking for the
           framer typed "framer", and would not find it inside "**framer**". */
        read={(n) => ({ name: headingOf(n), description: plainText(n.body), facet: null, tags: [] })}
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
                <NoteCard
                  key={n.id}
                  note={n}
                  selected={n.id === openId}
                  busy={isPending}
                  onOpen={() => choose(n)}
                  onPin={() => pin(n)}
                  onRemove={() => remove(n)}
                />
              ))}
            </div>

            <div className="q-card q-section">
              {open ? (
                <div className="q-stack q-stack-sm">
                  <div className="q-row q-row-between">
                    <input
                      className="q-input"
                      placeholder="Title (optional)"
                      value={title}
                      onChange={(e) => setDraft({ title: e.target.value, body })}
                      style={{ fontWeight: 600 }}
                    />
                    {/* Two readings of one string, so the toggle is a view
                        control rather than a mode with anything at stake. */}
                    <span className="q-seg">
                      <button
                        type="button"
                        className={mode === 'write' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'}
                        aria-pressed={mode === 'write'}
                        onClick={() => setMode('write')}
                        title="Write"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className={mode === 'read' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'}
                        aria-pressed={mode === 'read'}
                        onClick={() => setMode('read')}
                        title="Read"
                      >
                        <Eye size={14} />
                      </button>
                    </span>
                  </div>

                  {mode === 'write' ? (
                    <MarkdownEditor
                      value={body}
                      onChange={(next) => setDraft({ title, body: next })}
                      rows={16}
                      autoFocus
                      ariaLabel="The note"
                      placeholder="Ring the framer about 20x30 stock…"
                    />
                  ) : (
                    /*
                     * Double-clicking the note starts editing it, which is what
                     * a person who has just read something and wants to change
                     * a word will try before they look for a control.
                     */
                    <div className="q-sunken q-section" onDoubleClick={() => setMode('write')}>
                      {body.trim()
                        ? <Markdown text={body} onToggleTask={tick} />
                        : <p className="q-empty">Nothing written yet.</p>}
                    </div>
                  )}

                  {/* Says the thing an autosaving box has to say, or a person
                      cannot tell a saved note from a lost one. */}
                  <div className="q-row q-row-between">
                    <span className="q-meta-sm">
                      {isPending && savingFor.current === open.id ? 'Saving…' : `Saved ${when(open.updatedAt)}`}
                    </span>
                    <span className="q-row q-row-sm">
                      {progress && <TaskProgress done={progress.done} total={progress.total} />}
                      {stats.words > 0 && (
                        <span className="q-meta-sm">
                          {stats.words} {stats.words === 1 ? 'word' : 'words'}
                        </span>
                      )}
                    </span>
                  </div>
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
 * One note in the list.
 *
 * The preview shows the words, not the marks. A card reading "## Ring the
 * framer" would be showing a person the formatting instead of the note, and the
 * point of the list is to be read at a glance.
 */
function NoteCard({
  note, selected, busy, onOpen, onPin, onRemove,
}: {
  note: Note;
  selected: boolean;
  busy: boolean;
  onOpen: () => void;
  onPin: () => void;
  onRemove: () => void;
}) {
  const preview = useMemo(() => plainText(note.body), [note.body]);
  const progress = useMemo(() => taskProgress(note.body), [note.body]);

  return (
    <div
      className={selected ? 'q-card q-card-interactive q-card-selected' : 'q-card q-card-interactive'}
      onClick={onOpen}
      style={{ cursor: 'pointer' }}
    >
      <div className="q-row q-row-between">
        <strong className="q-strong">{headingOf(note)}</strong>
        <span className="q-row q-row-sm q-card-act" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="q-btn-ghost q-btn-xs"
            disabled={busy}
            title={note.pinned ? 'Stop keeping it at the top' : 'Keep it at the top'}
            onClick={onPin}
          >
            {note.pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <ConfirmButton
            className="q-btn-ghost q-btn-xs"
            disabled={busy}
            confirmLabel="Delete it?"
            title="Remove this note for good"
            onConfirm={onRemove}
          >
            &times;
          </ConfirmButton>
        </span>
      </div>

      {preview && (
        <p className="q-meta-sm q-clamp-2" style={{ marginTop: '4px' }}>{preview}</p>
      )}

      <span className="q-row q-row-sm">
        <span className="q-meta-sm">{when(note.updatedAt)}{note.authorName ? ` · ${note.authorName}` : ''}</span>
        {progress && <TaskProgress done={progress.done} total={progress.total} />}
      </span>
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
 *
 * The first line is taken from the note read plainly, so a note that opens with
 * a heading is called what the heading says rather than what it is marked up as.
 */
function headingOf(n: Note): string {
  const title = (n.title || '').trim();
  if (title) return title;
  const first = plainText(n.body).split('\n').map((l) => l.trim()).find(Boolean);
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

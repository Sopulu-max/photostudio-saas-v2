'use client';

import React, { useState, useTransition, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff, Palette, Eye, Pencil, X, Trash2, Bell, BellOff } from 'lucide-react';
import {
  createNote, updateNote, setNotePinned, setNoteColour, setNoteReminder, deleteNote,
  NOTE_COLOURS, NOTE_COLOUR_NAMES, type Note, type NoteColour,
} from '@/modules/notes/interface';
import { plainText, taskProgress, noteStats, toggleTaskLine } from '@/kernel/markdown';
import { Markdown, TaskProgress } from '@/components/Markdown';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { ConfirmButton } from '@/components/ConfirmButton';
import { CatalogFilter } from '@/components/CatalogFilter';
import { toast, readableError } from '@/components/Toast';

/**
 * The wall.
 *
 * A BOARD, NOT A LIST BESIDE AN EDITOR. The shape this replaces was right that
 * a note is a few lines and that making somebody navigate to read four of them
 * is a filing cabinet rather than a notebook — and then showed two clamped
 * lines of each and made you click to read the rest, which is the same trip
 * with the walking hidden. Here the cards ARE the notes. Nothing on this page
 * is a preview of anything, and a studio can read its whole working memory
 * without opening a single one.
 *
 * OPENING IS A DETOUR, NOT A DESTINATION. A note grows into an overlay over the
 * board it came from, and closing puts it back. There is no route, no back
 * button, and nothing lost from view — the wall is still behind it.
 *
 * CAPTURE IS ONE MOTION. The old New note made an empty row and then asked you
 * to type into it. A thought costs nothing to write and should cost nothing to
 * start: one line at the top, which becomes the whole editor the moment it is
 * touched, and saves itself into the wall.
 *
 * COLOUR IS THE OPERATOR'S, AND THE SYSTEM'S. Seven hues, the ones Lumen
 * already defines twice — colour here means nothing the app decides, which is
 * exactly why it can mean whatever the studio needs. Its own act and its own
 * action: choosing a colour is not editing what a note says, and the two do not
 * want the same save. Typing waits a second for the quiet; a colour lands at
 * once.
 */
export function NotesBoard({ initial, now }: { initial: Note[]; now: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Note[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [painting, setPainting] = useState<string | null>(null);

  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  /* Which note is being written right now. State rather than a ref, because it
     decides what the footer says — and a value the render reads is state by
     definition, whatever it is called. */
  const [savingId, setSavingId] = useState<string | null>(null);

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
    const t = setTimeout(() => {
      setSavingId(id);
      startTransition(async () => {
        try {
          await updateNote({ id, title: draft.title, body: draft.body });
          setNotes((prev) => prev.map((n) => (
            n.id === id ? { ...n, title: draft.title || null, body: draft.body } : n
          )));
          router.refresh();
        } catch (e) {
          toast.bad(readableError(e, 'That note could not be saved.'));
        } finally {
          setSavingId((cur) => (cur === id ? null : cur));
        }
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, open, router]);

  const run = useCallback((fn: () => Promise<unknown>, fallback: string) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, fallback)); }
    }), [router]);

  const choose = (n: Note) => {
    setOpenId(n.id);
    setDraft({ title: n.title ?? '', body: n.body });
    setPainting(null);
  };

  const close = () => { setOpenId(null); setDraft(null); };

  const pin = (n: Note) => {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
    run(() => setNotePinned({ id: n.id, pinned: !n.pinned }), 'That could not be changed.');
  };

  const paint = (n: Note, colour: NoteColour | null) => {
    // Shown at once — the wash is the whole point, and a colour that waited for
    // a round trip would arrive after the eye had moved on.
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, colour } : x)));
    setPainting(null);
    run(() => setNoteColour({ id: n.id, colour }), 'That could not be changed.');
  };

  const remind = (n: Note, at: string | null) => {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, remindAt: at } : x)));
    run(() => setNoteReminder({ id: n.id, remindAt: at }), 'That could not be changed.');
  };

  const remove = (n: Note) => {
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    if (openId === n.id) close();
    run(() => deleteNote(n.id), 'The note could not be removed.');
  };

  /* Ticking a box is an edit like any other, wherever it is pressed. On the
     board it writes straight through; in the open note it joins the draft and
     falls into the same save that typing does. */
  const tickOnBoard = (n: Note, line: number) => {
    const next = toggleTaskLine(n.body, line);
    if (next === n.body) return;
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, body: next } : x)));
    run(() => updateNote({ id: n.id, body: next }), 'That note could not be saved.');
  };

  const born = (note: Note) => {
    setNotes((prev) => [note, ...prev]);
    router.refresh();
  };

  return (
    <div className="q-stack q-stack-lg">
      <QuickCapture onBorn={born} />

      <CatalogFilter
        items={notes}
        noun="note"
        kind="catalogue"
        views={false}
        /* Searched on the words rather than the marks: a person looking for the
           framer typed "framer", and would not find it inside the asterisks. */
        read={(n) => ({ name: headingOf(n), description: plainText(n.body), facet: null, tags: [] })}
        sorts={[
          { key: 'recent', label: 'Recently touched', compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
          { key: 'oldest', label: 'Oldest first', compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
          { key: 'az', label: 'A–Z', compare: (a, b) => headingOf(a).localeCompare(headingOf(b)) },
        ]}
      >
        {(shown) => {
          /* Pinned notes are lifted out rather than merely sorted first, so the
             wall says WHY they are at the top instead of leaving a person to
             infer it from an order they cannot see. */
          const pinned = shown.filter((n) => n.pinned);
          const rest = shown.filter((n) => !n.pinned);

          if (shown.length === 0) {
            return (
              <div className="q-card q-empty-lg q-stack">
                <h3 className="q-section-title">
                  {notes.length === 0 ? 'Nothing on the wall yet' : 'Nothing matches that'}
                </h3>
                <p className="q-meta">
                  {notes.length === 0
                    ? 'Anything the studio needs to remember that no booking, client or invoice has a place for.'
                    : 'Clear the search to see them all.'}
                </p>
              </div>
            );
          }

          const wall = (list: Note[], from: number) => (
            <div className="q-board">
              {list.map((n, i) => (
                <BoardNote
                  key={n.id}
                  note={n}
                  index={from + i}
                  busy={isPending}
                  painting={painting === n.id}
                  now={now}
                  onOpen={() => choose(n)}
                  onPin={() => pin(n)}
                  onPaintToggle={() => setPainting(painting === n.id ? null : n.id)}
                  onPaint={(c) => paint(n, c)}
                  onRemove={() => remove(n)}
                  onTick={(line) => tickOnBoard(n, line)}
                />
              ))}
            </div>
          );

          return (
            <div>
              {pinned.length > 0 && (
                <>
                  <p className="q-board-band">Pinned</p>
                  {wall(pinned, 0)}
                </>
              )}
              {rest.length > 0 && (
                <>
                  {pinned.length > 0 && <p className="q-board-band">Others</p>}
                  {wall(rest, pinned.length)}
                </>
              )}
            </div>
          );
        }}
      </CatalogFilter>

      {open && (
        <OpenNote
          note={open}
          title={title}
          body={body}
          saving={savingId === open.id}
          onChange={(next) => setDraft(next)}
          onPin={() => pin(open)}
          onPaint={(c) => paint(open, c)}
          onRemind={(at) => remind(open, at)}
          onRemove={() => remove(open)}
          onClose={close}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * One card on the wall.
 * ---------------------------------------------------------------------- */

function BoardNote({
  note, index, busy, painting, now,
  onOpen, onPin, onPaintToggle, onPaint, onRemove, onTick,
}: {
  note: Note;
  index: number;
  busy: boolean;
  painting: boolean;
  now: string;
  onOpen: () => void;
  onPin: () => void;
  onPaintToggle: () => void;
  onPaint: (c: NoteColour | null) => void;
  onRemove: () => void;
  onTick: (line: number) => void;
}) {
  const progress = useMemo(() => taskProgress(note.body), [note.body]);
  const heading = (note.title || '').trim();

  /*
   * The fade at the foot of a card is a promise that there is more, and only a
   * note that actually overflows may make it. Whether it does is a fact about
   * laid-out pixels, which no stylesheet can ask about — so it is measured, and
   * the class is written straight onto the node. Writing to the DOM is what an
   * effect is FOR; routing a measurement through state would re-render every
   * card to tell it something only its own bottom edge cares about.
   */
  const clip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = clip.current;
    if (!el) return;
    el.classList.toggle('q-board-more', el.scrollHeight > el.clientHeight + 2);
  }, [note.body]);

  return (
    <div
      className={`q-board-note ${tintOf(note.colour)}`}
      /* The one thing here that cannot be a class, because it is data: this
         card's place in the wave. */
      style={{ ['--i' as string]: index }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${headingOf(note)}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
    >
      {heading && <span className="q-board-title">{heading}</span>}

      {note.body.trim() ? (
        <div className="q-board-clip" ref={clip}>
          <Markdown text={note.body} className="q-board-body" onToggleTask={onTick} />
        </div>
      ) : (
        !heading && <p className="q-meta-sm">Empty note.</p>
      )}

      <div className="q-board-foot" onClick={(e) => e.stopPropagation()}>
        {painting ? (
          <Paint chosen={note.colour} onPick={onPaint} />
        ) : (
          <span className="q-row q-row-sm">
            {note.remindAt
              ? <RemindChip at={note.remindAt} now={now} />
              : <span className="q-meta-sm">{when(note.updatedAt)}</span>}
            {progress && <TaskProgress done={progress.done} total={progress.total} />}
          </span>
        )}

        <span className="q-board-acts">
          <button
            type="button"
            className="q-btn-ghost q-btn-xs"
            disabled={busy}
            aria-pressed={note.pinned}
            title={note.pinned ? 'Stop keeping it at the top' : 'Keep it at the top'}
            onClick={onPin}
          >
            <span className={note.pinned ? 'q-board-pin q-board-pin-on' : 'q-board-pin'}>
              {note.pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </span>
          </button>
          <button
            type="button"
            className="q-btn-ghost q-btn-xs"
            disabled={busy}
            aria-expanded={painting}
            title="Colour"
            onClick={onPaintToggle}
          >
            <Palette size={14} />
          </button>
          <ConfirmButton
            className="q-btn-ghost q-btn-xs"
            disabled={busy}
            confirmLabel="Delete it?"
            title="Remove this note for good"
            onConfirm={onRemove}
          >
            <Trash2 size={14} />
          </ConfirmButton>
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The seven, and plain paper.
 * ---------------------------------------------------------------------- */

function Paint({
  chosen, onPick,
}: {
  chosen: NoteColour | null;
  onPick: (c: NoteColour | null) => void;
}) {
  return (
    <span className="q-paint" role="group" aria-label="Colour">
      <button
        type="button"
        className={chosen === null ? 'q-paint-dot q-paint-none q-paint-dot-on' : 'q-paint-dot q-paint-none'}
        aria-pressed={chosen === null}
        title="No colour"
        onClick={() => onPick(null)}
      />
      {NOTE_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className={chosen === c ? `q-paint-dot q-paint-${c} q-paint-dot-on` : `q-paint-dot q-paint-${c}`}
          aria-pressed={chosen === c}
          title={NOTE_COLOUR_NAMES[c]}
          onClick={() => onPick(c)}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * When a note should come back.
 * ---------------------------------------------------------------------- */

/**
 * Setting a date, and taking it off again.
 *
 * A NATIVE datetime-local, not a calendar of our own. The operator's own
 * device already knows how they write dates, which keyboard to raise on a
 * phone, and how their locale orders the parts — every one of which a custom
 * picker would have to be told and would get wrong somewhere.
 *
 * NOTHING FIRES. The date puts the note on the calendar; it does not send
 * anything and nothing is owed. That is why the control says "Remind me" and
 * not "Due" — a note is working memory that asked to be seen again, and a word
 * like "due" would promise a chase that no part of this does.
 */
function Remind({ at, onSet }: { at: string | null; onSet: (at: string | null) => void }) {
  const [open, setOpen] = useState(at !== null);

  if (!open && !at) {
    return (
      <button type="button" className="q-btn-ghost q-btn-xs" onClick={() => setOpen(true)}>
        <Bell size={13} /> Remind me
      </button>
    );
  }

  return (
    <span className="q-row q-row-sm">
      <input
        type="datetime-local"
        className="q-input q-remind-at"
        aria-label="When this note should come back"
        value={toLocalInput(at)}
        onChange={(e) => onSet(fromLocalInput(e.target.value))}
      />
      <button
        type="button"
        className="q-btn-ghost q-btn-xs"
        title="No date"
        onClick={() => { onSet(null); setOpen(false); }}
      >
        <BellOff size={13} />
      </button>
    </span>
  );
}

/** The date a card wears instead of its last-touched time, once it has one. */
function RemindChip({ at, now }: { at: string; now: string }) {
  const due = new Date(at).getTime() <= new Date(now).getTime();
  return (
    <span className={due ? 'q-remind q-remind-due' : 'q-remind'} title={new Date(at).toLocaleString()}>
      <Bell size={11} />
      {whenDated(at)}
    </span>
  );
}

/*
 * The row keeps an instant; the input speaks the operator's own clock.
 *
 * datetime-local has no timezone in it at all, so both directions have to go
 * through the browser's — read it as UTC and a studio in Lagos gets a reminder
 * an hour out from the one it typed.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A reminder reads as a day, and as a time only when one was chosen. */
function whenDated(iso: string): string {
  const d = new Date(iso);
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return midnight
    ? day
    : `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/* -------------------------------------------------------------------------
 * One line, until it is wanted.
 * ---------------------------------------------------------------------- */

function QuickCapture({ onBorn }: { onBorn: (n: Note) => void }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [colour, setColour] = useState<NoteColour | null>(null);

  const reset = () => { setTitle(''); setBody(''); setColour(null); setOpen(false); };

  /*
   * Closing keeps what was written, and throws away what was not.
   *
   * A note nobody remembered to save is a note that was never taken — but an
   * empty box that was opened and closed is not a note, and saving it would put
   * a blank card on the wall for every time somebody clicked and changed their
   * mind.
   */
  const done = () => {
    if (!title.trim() && !body.trim()) { reset(); return; }
    startTransition(async () => {
      try {
        const { noteId } = await createNote({ title, body, colour });
        const now = new Date().toISOString();
        onBorn({
          id: noteId, title: title.trim() || null, body, pinned: false, colour,
          authorName: null, aboutType: null, aboutId: null, remindAt: null,
          createdAt: now, updatedAt: now,
        });
        reset();
      } catch (e) {
        toast.bad(readableError(e, 'The note could not be created.'));
      }
    });
  };

  if (!open) {
    return (
      <div className="q-capture">
        <button type="button" className="q-capture-shut" onClick={() => setOpen(true)}>
          Take a note…
        </button>
      </div>
    );
  }

  return (
    <div className="q-capture q-capture-open">
      <div className="q-capture-body q-stack q-stack-sm">
        <input
          className="q-input"
          placeholder="Title (optional)"
          value={title}
          disabled={isPending}
          onChange={(e) => setTitle(e.target.value)}
          style={{ fontWeight: 600 }}
        />
        <MarkdownEditor
          value={body}
          onChange={setBody}
          rows={5}
          autoFocus
          disabled={isPending}
          ariaLabel="A new note"
          placeholder="Ring the framer about 20x30 stock…"
          onSubmit={done}
        />
        <div className="q-row q-row-between">
          <Paint chosen={colour} onPick={setColour} />
          <button
            type="button"
            className="q-btn q-btn-secondary q-btn-sm"
            aria-busy={isPending}
            disabled={isPending}
            onClick={done}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * One note, opened over the wall it came from.
 * ---------------------------------------------------------------------- */

function OpenNote({
  note, title, body, saving, onChange, onPin, onPaint, onRemind, onRemove, onClose,
}: {
  note: Note;
  title: string;
  body: string;
  saving: boolean;
  onChange: (next: { title: string; body: string }) => void;
  onPin: () => void;
  onPaint: (c: NoteColour | null) => void;
  onRemind: (at: string | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  /* An empty note opens ready to type, because that is the only thing anybody
     does with an empty note. One with words opens showing them. */
  const [mode, setMode] = useState<'write' | 'read'>(note.body.trim() ? 'read' : 'write');
  const stats = useMemo(() => noteStats(body), [body]);
  const progress = useMemo(() => taskProgress(body), [body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="q-note-veil-el"
      role="dialog"
      aria-modal="true"
      aria-label={headingOf(note)}
      /* Only the veil itself closes. A click that started inside the note and
         ended outside it is a selection being dragged, not a dismissal. */
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`q-note-modal ${tintOf(note.colour)}`}>
        <div className="q-stack q-stack-sm">
          <div className="q-row q-row-between">
            <input
              className="q-input"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => onChange({ title: e.target.value, body })}
              style={{ fontWeight: 600 }}
            />
            <span className="q-seg">
              <button
                type="button"
                className={mode === 'write' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'}
                aria-pressed={mode === 'write'}
                title="Write"
                onClick={() => setMode('write')}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className={mode === 'read' ? 'q-seg-btn q-seg-on' : 'q-seg-btn'}
                aria-pressed={mode === 'read'}
                title="Read"
                onClick={() => setMode('read')}
              >
                <Eye size={14} />
              </button>
            </span>
          </div>

          {mode === 'write' ? (
            <MarkdownEditor
              value={body}
              onChange={(next) => onChange({ title, body: next })}
              rows={14}
              autoFocus
              ariaLabel="The note"
              placeholder="Ring the framer about 20x30 stock…"
            />
          ) : (
            <div onDoubleClick={() => setMode('write')}>
              {body.trim()
                ? <Markdown text={body} onToggleTask={(line) => onChange({ title, body: toggleTaskLine(body, line) })} />
                : <p className="q-empty">Nothing written yet.</p>}
            </div>
          )}

          <div className="q-row q-row-between">
            <Paint chosen={note.colour} onPick={onPaint} />
            <Remind at={note.remindAt} onSet={onRemind} />
          </div>

          <div className="q-row q-row-between">
            <span className="q-row q-row-sm">
              <span className="q-meta-sm">{saving ? 'Saving…' : `Saved ${when(note.updatedAt)}`}</span>
              {progress && <TaskProgress done={progress.done} total={progress.total} />}
              {stats.words > 0 && (
                <span className="q-meta-sm">{stats.words} {stats.words === 1 ? 'word' : 'words'}</span>
              )}
            </span>

            <span className="q-row q-row-sm">
              <button
                type="button"
                className="q-btn-ghost q-btn-xs"
                aria-pressed={note.pinned}
                title={note.pinned ? 'Stop keeping it at the top' : 'Keep it at the top'}
                onClick={onPin}
              >
                <span className={note.pinned ? 'q-board-pin q-board-pin-on' : 'q-board-pin'}>
                  {note.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                </span>
              </button>
              <ConfirmButton
                className="q-btn-ghost q-btn-xs"
                confirmLabel="Delete it?"
                title="Remove this note for good"
                onConfirm={onRemove}
              >
                <Trash2 size={14} />
              </ConfirmButton>
              <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={onClose}>
                <X size={14} /> Close
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Small truths.
 * ---------------------------------------------------------------------- */

/** Null is plain paper, which is most of them. */
function tintOf(colour: NoteColour | null): string {
  return colour ? `q-tint-${colour}` : '';
}

/**
 * What a note is called.
 *
 * Its title, or its first line, or the honest admission that it is empty. The
 * first line is taken from the note read plainly, so one that opens with a
 * heading is called what the heading says rather than what it is marked up as.
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
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff } from 'lucide-react';
import Link from 'next/link';
import {
  createNote, updateNote, setNotePinned, deleteNote, setNoteAbout,
  type Note, type NoteAbout,
} from '@/modules/notes/interface';
import { toggleTaskLine, taskProgress } from '@/kernel/markdown';
import { Markdown, TaskProgress } from '@/components/Markdown';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toast, readableError } from '@/components/Toast';

/**
 * The notes about one thing, written where that thing is.
 *
 * The same notes the notes app holds — not a second store. A note written here
 * carries what it is about, and shows up in /notes with that said; one written
 * there about nothing in particular stays about nothing. There is one table and
 * one module, because two places to write a note about a client is the drift
 * this codebase keeps paying for, and the clients page already had one: a
 * "Notes" textarea, empty on every client, saying the same sentence.
 *
 * AND ONE WAY TO WRITE ONE. The same editor and the same reader as the notes
 * app, so a note formatted on a booking page is the note the notes app shows.
 * Two renderers for one text column would be the same drift wearing different
 * clothes — a checklist that ticks in one place and prints its brackets in the
 * other is two answers to what a note is.
 *
 * WRITING IS ONE BOX AND ONE BUTTON. On the notes app a note saves itself as
 * the typing stops, because that page IS the note. Here the note is a small
 * part of a larger page an operator is doing something else on, so an explicit
 * Add is honest: nothing is written until they say so, and nothing half-typed
 * is kept when they navigate away.
 *
 * DETACHING KEEPS THE NOTE. What it says was worth keeping whether or not it
 * turned out to belong to this booking, so taking it off sends it to the notes
 * app rather than deleting it. Deleting is its own act, and it asks.
 */
export function NotesFor({
  about,
  aboutLabel,
  notes,
}: {
  about: { type: NoteAbout; id: string };
  /** What this thing is called, for the copy — "this booking", "Ngozi Madu". */
  aboutLabel: string;
  notes: Note[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  /*
   * What a box shows the instant it is pressed.
   *
   * This page's notes come from the server and only change when a refresh lands,
   * which is a round trip away. A checkbox that waits for it looks broken, so
   * the tick is shown at once.
   *
   * Each pending tick remembers the body it was made FROM, and stops applying
   * the moment the server stops saying that — which covers both endings without
   * an effect to keep them in step. When the save lands, the server's answer IS
   * the tick, so there is nothing left to show; and when something else changed
   * the note in the meantime, the server's answer is the true one and a stale
   * tick must not win over it.
   */
  const [ticked, setTicked] = useState<Record<string, { from: string; to: string }>>({});

  const bodyOf = (n: Note) => {
    const pending = ticked[n.id];
    return pending && pending.from === n.body ? pending.to : n.body;
  };

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, 'That could not be saved.')); }
    });

  const add = () => {
    const text = body.trim();
    if (!text) return;
    run(() => createNote({ body: text, about }), () => setBody(''));
  };

  const tick = (n: Note, line: number) => {
    const current = bodyOf(n);
    const next = toggleTaskLine(current, line);
    if (next === current) return;
    setTicked((prev) => ({ ...prev, [n.id]: { from: n.body, to: next } }));
    run(() => updateNote({ id: n.id, body: next }));
  };

  return (
    <div className="q-stack q-stack-md">
      <div className="q-field" style={{ marginBottom: 0 }}>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          rows={3}
          disabled={isPending}
          ariaLabel={`A note about ${aboutLabel}`}
          placeholder={`Anything worth remembering about ${aboutLabel}.`}
          /* Enter is a newline in a note; the shortcut is the usual one. */
          onSubmit={add}
        />
        <div className="q-row" style={{ marginTop: '8px' }}>
          <button
            type="button"
            className="q-btn q-btn-primary q-btn-sm"
            aria-busy={isPending}
            disabled={isPending || !body.trim()}
            onClick={add}
          >
            Add note
          </button>
          <span className="q-meta-sm">
            Kept with this {about.type}, and in <Link href="/notes" className="q-plain-link">Notes</Link>.
          </span>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="q-meta-sm">Nothing noted yet.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {notes.map((n) => {
            const text = bodyOf(n);
            const progress = taskProgress(text);

            return (
              <div key={n.id} className="q-tile q-stack q-stack-sm">
                <div className="q-row q-row-between">
                  <span className="q-row q-row-sm">
                    <span className="q-meta-sm">
                      {n.authorName ? `${n.authorName} · ` : ''}{when(n.updatedAt)}
                    </span>
                    {progress && <TaskProgress done={progress.done} total={progress.total} />}
                  </span>
                  <span className="q-row q-row-sm">
                    <button
                      type="button"
                      className="q-btn-ghost q-btn-xs"
                      disabled={isPending}
                      title={n.pinned ? 'Stop keeping it at the top' : 'Keep it at the top'}
                      onClick={() => run(() => setNotePinned({ id: n.id, pinned: !n.pinned }))}
                    >
                      {n.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                    </button>
                    <button
                      type="button"
                      className="q-btn-ghost q-btn-xs"
                      disabled={isPending}
                      onClick={() => {
                        setEditingId(editingId === n.id ? null : n.id);
                        setEditBody(text);
                      }}
                    >
                      {editingId === n.id ? 'Done' : 'Edit'}
                    </button>
                    {/*
                      * Armed, and worded as what it does: the note survives and
                      * goes to the notes app. An operator taking a note OFF a
                      * booking is not throwing it away, and a control that read
                      * like deletion would stop them doing it.
                      */}
                    <ConfirmButton
                      className="q-btn-ghost q-btn-xs"
                      disabled={isPending}
                      confirmLabel="Take it off?"
                      title={`Take this note off the ${about.type}. It stays in Notes.`}
                      onConfirm={() => run(() => setNoteAbout({ id: n.id, about: null }))}
                    >
                      Detach
                    </ConfirmButton>
                    <ConfirmButton
                      className="q-btn-ghost q-btn-xs"
                      disabled={isPending}
                      confirmLabel="Delete it?"
                      title="Remove this note for good"
                      onConfirm={() => run(() => deleteNote(n.id))}
                    >
                      &times;
                    </ConfirmButton>
                  </span>
                </div>

                {editingId === n.id ? (
                  <>
                    <MarkdownEditor
                      value={editBody}
                      onChange={setEditBody}
                      rows={4}
                      disabled={isPending}
                      ariaLabel="The note"
                      onSubmit={() => run(
                        () => updateNote({ id: n.id, body: editBody }),
                        () => setEditingId(null),
                      )}
                    />
                    <div className="q-row">
                      <button
                        type="button"
                        className="q-btn q-btn-primary q-btn-sm"
                        disabled={isPending}
                        onClick={() => run(
                          () => updateNote({ id: n.id, body: editBody }),
                          () => setEditingId(null),
                        )}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="q-btn q-btn-secondary q-btn-sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  text.trim()
                    ? <Markdown text={text} onToggleTask={(line) => tick(n, line)} />
                    : <p className="q-meta-sm">Empty.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Recent times read better as "today"; older ones want the date. */
function when(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

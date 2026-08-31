'use client';

import React, { useSyncExternalStore } from 'react';

/**
 * WHAT AN ACTION SAYS WHEN IT IS OVER.
 *
 * Every action in this app used to answer with window.alert — 74 of them. An
 * alert is a modal: it stops the page, it cannot be styled, it ignores the
 * theme, it arrives dead centre over what you were looking at, and it has to be
 * dismissed before anything else can happen. For a tool where the ordinary case
 * is "that worked", it charges a click for good news.
 *
 * This is the other half of the motion work. Entrances tell you a page has
 * assembled; this tells you an action has LANDED — which is the half an
 * operator actually needs, because it is the half that carries a result.
 *
 * A MODULE STORE, NOT A CONTEXT, on purpose. A provider would mean threading a
 * hook through 74 call sites, several of which are inside plain callbacks and
 * one inside a shared runner that is not a component at all. A plain
 * `import { toast }` works from any of them, and useSyncExternalStore keeps
 * React honestly subscribed to it.
 */

export type ToastTone = 'ok' | 'bad' | 'info';

export type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  /**
   * Marked while it plays its exit. It stays mounted through this — a thing
   * that vanishes between frames was never seen leaving, and half of what makes
   * motion legible is watching something go rather than finding it gone.
   */
  leaving?: boolean;
};

/* How long each tone is worth reading. A failure is longer than a success
   because a failure has to be understood, not just noticed. */
const HOLD: Record<ToastTone, number> = { ok: 4000, info: 5000, bad: 9000 };

/* Kept in step with --q-dur-2 in globals.css. */
const EXIT = 240;

/* Four at once is already a lot to read. Older ones give way. */
const MAX = 4;

let items: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

/* One stable array identity between changes: useSyncExternalStore compares
   snapshots by reference and would loop forever on a fresh array each read. */
function notify() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const EMPTY: Toast[] = [];
function getSnapshot() { return items; }
function getServerSnapshot() { return EMPTY; }

/** Start its exit. Removed for real once the exit has had time to play. */
export function dismissToast(id: number) {
  const found = items.find((t) => t.id === id);
  if (!found || found.leaving) return;
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  notify();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    notify();
  }, EXIT);
}

function push(tone: ToastTone, message: string) {
  const text = String(message ?? '').trim();
  if (!text) return -1;

  /* Pressing a failing button three times is one problem, not three. The
     existing one is restaged instead, so it re-enters and resets its clock. */
  const same = items.find((t) => !t.leaving && t.message === text && t.tone === tone);
  if (same) {
    const id = nextId++;
    items = items.map((t) => (t.id === same.id ? { ...t, id } : t));
    notify();
    setTimeout(() => dismissToast(id), HOLD[tone]);
    return id;
  }

  const id = nextId++;
  items = [...items, { id, tone, message: text }].slice(-MAX);
  notify();
  setTimeout(() => dismissToast(id), HOLD[tone]);
  return id;
}

export const toast = {
  /** It worked, and here is what happened. */
  ok: (message: string) => push('ok', message),
  /** It did not work. Held longest, and announced assertively to a reader. */
  bad: (message: string) => push('bad', message),
  /** Neither: something you should know about what you just did. */
  info: (message: string) => push('info', message),
};

/**
 * THE SENTENCE THE STUDIO ACTUALLY WROTE, NOT THE FRAMEWORK'S APOLOGY.
 *
 * `e?.message || fallback` is the shape this codebase used everywhere, and it
 * is wrong in production. A server action that throws deliberately — "a
 * contract needs a client" — has its message replaced by Next with "An error
 * occurred in the Server Components render… the specific message is omitted in
 * production builds". That replacement is a non-empty string, so it wins the
 * `||`, and the careful sentence is the thing that gets dropped.
 *
 * That is not hypothetical: it is verbatim what an operator saw when they took
 * a booking with no client on it. So a redacted message counts as no message,
 * and the caller's own words are used instead.
 */
const REDACTED = /server components render|omitted in production|specific message is omitted/i;

export function readableError(e: unknown, fallback: string): string {
  const m = (e as { message?: unknown } | null | undefined)?.message;
  if (typeof m !== 'string' || !m.trim()) return fallback;
  if (REDACTED.test(m)) return fallback;
  return m;
}

/**
 * Do it; say so if it fails.
 *
 * The shape 63 call sites were already writing by hand, with the redaction bug
 * above baked into each one. Returns undefined on failure so a caller can tell
 * the difference without a second try/catch.
 */
export async function attempt<T>(fn: () => Promise<T>, whenFailed: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    toast.bad(readableError(e, whenFailed));
    return undefined;
  }
}

/**
 * Mounted once, in the root layout, so it covers the dashboard, the client
 * portal and the public booking page alike.
 */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (list.length === 0) return null;

  return (
    /*
     * aria-live on the region rather than role on each toast: a region that
     * already exists when a message arrives is announced; one that appears with
     * its message inside it frequently is not.
     */
    <div className="q-toast-stack" role="region" aria-label="Notifications">
      {list.map((t) => (
        <div
          key={t.id}
          className={`q-toast q-toast-${t.tone}${t.leaving ? ' q-toast-leaving' : ''}`}
          role={t.tone === 'bad' ? 'alert' : 'status'}
          aria-live={t.tone === 'bad' ? 'assertive' : 'polite'}
        >
          <span className="q-toast-mark" aria-hidden="true" />
          <p className="q-toast-text">{t.message}</p>
          <button
            type="button"
            className="q-toast-x"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

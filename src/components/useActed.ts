'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast, readableError } from '@/components/Toast';

/**
 * A LIST THAT SHOWS WHAT WAS JUST DONE TO IT.
 *
 * The difference between an app and a website is not how long a thing takes.
 * It is whether the thing answers. Every list in here was written the same way:
 * click, disable the whole list, await the server, read the page again, and only
 * then let the tick appear. So ticking one task off greyed out the other
 * nineteen and showed nothing for a second or two - the app was working and
 * looked asleep, and an operator marking off a morning's work felt every
 * round trip.
 *
 * THE TRUTH IS STILL THE SERVER'S. This does not keep state; it holds the
 * server's rows and shows one amendment to them until the server's own answer
 * arrives. React discards the amendment when the transition ends, so a refusal
 * needs no undo: the row simply goes back to what the studio's records say,
 * and the failure is said out loud. Nothing here can drift from the record,
 * which is the whole reason it is allowed to be instant.
 *
 * AND ONLY THE ROW ACTED ON IS BUSY. A list is not modal. Ticking one task must
 * not stop the next one being ticked, so the pending mark is per row and the
 * rest of the list stays live.
 *
 * Written once, here, for the same reason the colours live in one stylesheet:
 * the behaviour of "acting on a row" is one behaviour, and if each list spells
 * it out the lists drift apart.
 */
export function useActed<T>(rows: T[], keyOf: (row: T) => string) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const [shown, amend] = useOptimistic(
    rows,
    (current: T[], change: { key: string; patch: Partial<T> }) =>
      current.map((row) => (keyOf(row) === change.key ? { ...row, ...change.patch } : row)),
  );

  /**
   * Act on one row: what it will look like, and what to ask the server.
   *
   * `patch` is what the operator has just made true - the tick, the name, the
   * person - shown at once. `fn` is the studio's record catching up.
   */
  const act = (key: string, patch: Partial<T>, fn: () => Promise<unknown>, whenFailed: string) =>
    startTransition(async () => {
      amend({ key, patch });
      setBusy((had) => new Set(had).add(key));
      try {
        await fn();
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, whenFailed));
      } finally {
        setBusy((had) => {
          const next = new Set(had);
          next.delete(key);
          return next;
        });
      }
    });

  /**
   * For an action that changes no single row - adding one, removing one.
   *
   * There is nothing to show optimistically: a row that does not exist yet has
   * no place in the list and nothing to amend, so this one honestly waits, and
   * `working` is what a button says while it does.
   */
  const [working, setWorking] = useState(false);
  const actOnList = (fn: () => Promise<unknown>, whenFailed: string) =>
    startTransition(async () => {
      setWorking(true);
      try {
        await fn();
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, whenFailed));
      } finally {
        setWorking(false);
      }
    });

  return { shown, act, actOnList, working, isBusy: (key: string) => busy.has(key) };
}

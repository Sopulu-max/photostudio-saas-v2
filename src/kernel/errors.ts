/**
 * WHY A FAILURE FAILED, KEPT ATTACHED TO IT.
 *
 * Eighty-one readers and writers in this app did the same two lines:
 *
 *     console.error('Failed to list roles:', error);
 *     throw new Error('Failed to load roles');
 *
 * and the thrown error carried nothing. So the reason — a timeout, a bad
 * column, a policy refusal — reached a server log and stopped there, and
 * whoever saw the failure saw only which feature happened to be asking.
 *
 * THAT MISDIRECTS. The database was unreachable for an hour and the New
 * Booking page reported "Failed to load roles". Nothing was wrong with roles.
 * The message named the first thing that asked, which sends whoever is
 * debugging into the roles code, and it is the wrong code.
 *
 * So this does two things and neither of them changes what an operator reads
 * on a good day:
 *
 *   1. THE CAUSE TRAVELS. `cause` is standard on Error and does not appear in
 *      a message, so a toast stays as short as it was while the stack trace
 *      finally names the reason. Database errors are never appended to the
 *      operator's sentence — that is how internals leak into a UI.
 *
 *   2. UNREACHABLE SAYS SO. A connection that never opened is not a failure of
 *      whatever was being fetched, and calling it one is simply untrue. It
 *      gets its own sentence, and every caller gets the same one.
 */

/**
 * The database was not reached at all — as opposed to reached and refused.
 *
 * Supabase-js hands network failures back in the same PostgrestError shape as
 * a genuine query error, with the transport's complaint stuffed into `message`
 * and `details` and an empty `code`. So the distinction cannot be made on
 * shape and is made on content instead: these are the strings undici and Node
 * produce when a socket cannot be opened or a host cannot be resolved.
 */
export function isUnreachable(error: unknown): boolean {
  if (!error) return false;

  const seen = new Set<unknown>();
  const text: string[] = [];

  /* Down the cause chain, because a fetch failure is usually wrapped: the
     outer message says "fetch failed" and only the cause names the reason. */
  const collect = (value: unknown, depth: number) => {
    if (!value || depth > 5 || seen.has(value)) return;
    seen.add(value);
    if (typeof value === 'string') { text.push(value); return; }
    if (typeof value !== 'object') return;
    const e = value as Record<string, unknown>;
    for (const key of ['message', 'details', 'hint', 'code', 'errno', 'syscall']) {
      const v = e[key];
      if (typeof v === 'string' || typeof v === 'number') text.push(String(v));
    }
    collect(e.cause, depth + 1);
  };
  collect(error, 0);

  const haystack = text.join(' | ');
  return /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ConnectTimeoutError|UND_ERR|socket hang up|network|getaddrinfo/i
    .test(haystack);
}

/** One sentence, wherever the connection is what failed. */
export const UNREACHABLE_MESSAGE =
  'The database could not be reached. Check the connection and try again.';

/**
 * The error to throw when a database call fails.
 *
 * Takes the message the caller already wrote, so nothing an operator reads
 * changes — except where the connection is the problem, which is not the
 * caller's story to tell and gets the one sentence above instead.
 */
export function dbError(message: string, cause?: unknown): Error {
  if (isUnreachable(cause)) return new Error(UNREACHABLE_MESSAGE, { cause });
  return new Error(message, { cause });
}

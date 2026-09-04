/**
 * An instant, read back as the wall clock a studio would call it.
 *
 * THE INVERSE OF localInstant, AND THE HALF THAT WAS MISSING. studioHours has
 * always known how to turn "29 August, 10:00" in a studio's timezone into an
 * instant. Nothing knew how to turn an instant back into "29 August, 10:00" for
 * that same studio, so every screen showing a stored time reached for
 * `new Date(iso).getHours()` — which answers in the BROWSER's timezone, not the
 * studio's.
 *
 * That is wrong twice over. An operator working from a different zone than the
 * studio is shown the wrong time. And a form that then saves what it displayed
 * writes that wrong time back, so merely opening a booking and pressing Save
 * moves it.
 *
 * PURE, AND SAFE IN A BROWSER. localInstant has to go through Postgres because
 * it needs the UTC offset that applied on a PAST date, which JavaScript's own
 * conversion gets wrong twice a year. This direction needs no such thing: Intl
 * carries the IANA database and formats a known instant in a named zone
 * correctly, daylight saving included. So this can live in a client component,
 * which is exactly where it is needed.
 */

/**
 * Format an instant as `YYYY-MM-DDTHH:mm` in the given zone — the shape a
 * `<input type="datetime-local">` takes and returns.
 *
 * Returns '' for no instant, so it can populate an empty field directly.
 */
export function wallClockIn(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Some locales render midnight as 24 rather than 00 under hour12: false.
  const hour = get('hour') === '24' ? '00' : get('hour');

  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return `${date}T${hour}:${get('minute')}`;
}

/**
 * Whether a string is a bare wall clock rather than an instant.
 *
 * "2026-08-29T10:00" is a wall clock and means nothing until a timezone is
 * named. "2026-08-29T09:00:00.000Z" is already a moment. Anchored, because the
 * distinction was once drawn by an unanchored match that accepted the PREFIX of
 * an instant and then re-read its UTC time as a local one — shifting every
 * saved booking by the studio's offset, and again on every save after that.
 */
export function isWallClock(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T[012]\d:[0-5]\d(?::[0-5]\d)?$/.test(value.trim());
}

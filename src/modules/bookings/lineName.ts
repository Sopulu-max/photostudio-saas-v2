/**
 * WHAT A LINE IS CALLED - ONE RULE.
 *
 * A line that points at a package is called what that package is called:
 * the booking's own instance, which is renamed with it. A charge has no
 * package and is called what the operator named it. The line's own title
 * column is the name it was made with - a snapshot the instance's rename
 * never reaches - so it is read only where there is no package to read.
 *
 * This rule was written six times over (the invoice, the contract, the
 * document, the work readings, the booking's title) and skipped twice: the
 * booking page and its edit page printed the snapshot, so a renamed copy
 * showed the new name on every paper and the old name on the booking.
 */
export function lineNameOf(
  l: { title?: string | null; package?: { name?: string | null } | null } | null | undefined,
  fallback = 'Booking line',
): string {
  return (l?.package?.name as string) || (l?.title as string) || fallback;
}

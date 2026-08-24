/**
 * How a package's deliverable reads once it's specific.
 *
 * "Edited photographs × 6". "Highlight video · 30 second". "Framed print · 20x30".
 *
 * A plain module, not "use server": the package page, the storefront and the
 * invoice all render this, and none of them should invent their own phrasing.
 * A client who sees "6 edited photographs" in one place and "Edited
 * photographs (6)" in another is being told the same thing twice in two
 * voices.
 */
export type DeliverableSpec = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  spec_values?: Record<string, unknown> | null;
};

export function formatDeliverable(d: DeliverableSpec): string {
  const parts: string[] = [d.name];

  if (d.quantity != null && d.quantity > 0) {
    const n = Number(d.quantity);
    if (d.unit) {
      // "30 second video" reads better than "video x 30 second".
      parts[0] = `${n} ${d.unit}${n === 1 ? '' : 's'} ${d.name.toLowerCase()}`;
    } else {
      parts[0] = `${d.name} × ${n}`;
    }
  }

  if (d.spec_values && Object.keys(d.spec_values).length > 0) {
    const specs = Object.values(d.spec_values)
      .filter(v => v !== null && v !== '')
      .map(v => String(v));
    if (specs.length > 0) {
      parts.push(specs.join(', '));
    }
  }
  return parts.join(' · ');
}

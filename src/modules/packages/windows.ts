/**
 * A studio's shop windows — one per domain it has something to sell in.
 *
 * A studio that photographs and prints is one business with two shop windows,
 * and a client who came for a frame should not have to find it among the
 * portrait sessions. The retired /storefront route was killed for being a
 * second window onto the SAME packages; this is the opposite — one catalogue,
 * partitioned by what is being sold.
 *
 * NOTHING IS DECLARED. A window exists when a visible package stands in it,
 * and a package stands in the window of the domain its lead service belongs
 * to — `package_services` position 0, through `services.service_domain_id`.
 * That is the ontology's own answer to "is this studio publicly a print
 * shop?": derivable from structure, not typed into a field. A studio that
 * prints only to fulfil its own photography never makes a print-led package,
 * so no print window ever appears, and nothing had to be told.
 *
 * Pure: reads the public package shape, so the client page and the studio's
 * packages screen derive the same windows from the same rows.
 */

export type ShopWindow = { id: string; name: string; count: number };

export type WindowedPackage = {
  window?: { id: string; name: string } | null;
};

export function shopWindowsOf<T extends WindowedPackage>(packages: T[]): ShopWindow[] {
  const byId = new Map<string, ShopWindow>();
  for (const p of packages) {
    if (!p.window) continue;
    const w = byId.get(p.window.id) || { id: p.window.id, name: p.window.name, count: 0 };
    w.count += 1;
    byId.set(p.window.id, w);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The packages in one window — or, with no window asked for, all of them. */
export function inWindow<T extends WindowedPackage>(packages: T[], windowId: string | null | undefined): T[] {
  if (!windowId) return packages;
  return packages.filter((p) => p.window?.id === windowId);
}

/** The public link to one window. `/book/[slug]/[packageId]` takes any second segment, so this is a query. */
export function windowHref(slug: string, windowId: string): string {
  return `/book/${slug}?in=${encodeURIComponent(windowId)}`;
}

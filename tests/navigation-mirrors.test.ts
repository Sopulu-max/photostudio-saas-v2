import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * THE LAUNCHPAD AND THE SIDEBAR ARE ONE ANSWER, NOT TWO.
 *
 * The home page says so itself: "Mirrors the sidebar's grouping — Cockpit /
 * Work / Studio / Platform. When one moves, so does the other; two different
 * answers to 'where does this live' is worse than either answer alone."
 *
 * It had drifted anyway, in the quietest way a mirror can — by OMISSION. The
 * sidebar carried Galleries and Deliverables and the launchpad did not, so a
 * page promising "everything your studio runs on" was missing two of the things
 * it runs on. Nothing announced it, because a missing tile looks exactly like a
 * complete grid, and an operator who navigates from home would simply never
 * learn those existed.
 *
 * That is why this is a test rather than a fix. Fixing it closes today's gap;
 * only this closes tomorrow's, and the failure mode is silence.
 *
 * READ AS SOURCE, DELIBERATELY. Both lists are literals in TSX — importing
 * either would drag React and lucide into a node test for no gain, and the
 * question being asked is genuinely about what the files say.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Every `href: '/x'` in a nav file, in the order it appears. */
function hrefsOf(source: string): string[] {
  return [...source.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Every `label: 'X'` paired with its href, so a mismatch names itself. */
function entriesOf(source: string): { label: string; href: string }[] {
  return [...source.matchAll(/label:\s*'([^']+)',\s*href:\s*'([^']+)'/g)]
    .map((m) => ({ label: m[1], href: m[2] }));
}

describe('the launchpad mirrors the sidebar', () => {
  const sidebar = read('src/components/navigation/Sidebar.tsx');
  const launchpad = read('src/app/(app)/home/page.tsx');

  it('offers every destination the sidebar does', () => {
    // The sidebar's own entries, minus its section headers (which have no href).
    const inSidebar = entriesOf(sidebar);
    expect(inSidebar.length, 'the sidebar could not be read at all').toBeGreaterThan(8);

    const launchpadHrefs = new Set(hrefsOf(launchpad));
    const missing = inSidebar.filter((e) => !launchpadHrefs.has(e.href));

    expect(
      missing.map((m) => `${m.label} (${m.href})`),
      'the sidebar goes somewhere the home page does not offer',
    ).toEqual([]);
  });

  it('offers nothing the sidebar does not', () => {
    /*
     * The other direction matters too. A tile with no sidebar entry is a place
     * an operator can reach once, from home, and never find again — which is
     * worse than not offering it, because they will look for it.
     */
    const sidebarHrefs = new Set(hrefsOf(sidebar));
    const extra = entriesOf(launchpad).filter((e) => !sidebarHrefs.has(e.href));

    expect(
      extra.map((m) => `${m.label} (${m.href})`),
      'the home page offers somewhere the sidebar cannot reach',
    ).toEqual([]);
  });

  it('names each destination the same on both', () => {
    // "Deliverables" here and "Output types" there is the drift this module
    // spent a day undoing. One row, one word, wherever it is read.
    const byHref = new Map(entriesOf(sidebar).map((e) => [e.href, e.label]));
    const disagreements = entriesOf(launchpad)
      .filter((e) => byHref.has(e.href) && byHref.get(e.href) !== e.label)
      .map((e) => `${e.href}: sidebar says "${byHref.get(e.href)}", home says "${e.label}"`);

    expect(disagreements, 'the two navigations call the same place different things').toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A CLASS A COMPONENT WRITES MUST HAVE A RULE.
 *
 * WHY THIS FILE. The bookings page shipped as inline text. Nothing threw and
 * nothing failed: a stylesheet edit that replaced one block took the block
 * beside it as well, the table's thirty rules went with it, and `.q-reg-row`
 * simply stopped existing. The page still rendered, still passed its reads,
 * still passed every test - and looked like a wall of underlined sentences,
 * which is how the operator found it.
 *
 * Every visual rule in this app lives in one stylesheet by design (the Absolute
 * Law of Centralisation, docs/architecture/08-DESIGN_SYSTEM), so a missing rule
 * is always a deletion or a typo and never a component's business. This is the
 * check that a deletion cannot be silent.
 *
 * WHAT IT CANNOT SEE: a class built at runtime - `q-dist-c-${colour}`,
 * `q-badge-${kind}` - because the name does not exist until it runs. Those are
 * palette families, defined as a set, and a missing member shows as a colour
 * that does not paint rather than a layout that collapses.
 */

const SRC = join(process.cwd(), 'src');
const CSS = join(SRC, 'app', 'globals.css');

/**
 * Classes named in a component with no rule in the stylesheet, as they stood
 * when this check was written. Each is a small visual gap in an older surface,
 * not a collapse; they are recorded rather than fixed here so that a NEW one
 * fails. Styling one means deleting its line - the test says so if it does not.
 */
const KNOWN_GAPS = [
  'q-alert', 'q-alert-error', 'q-badge-accent', 'q-banner', 'q-banner-error', 'q-bar',
  'q-blank-state', 'q-btn-icon', 'q-form-actions', 'q-gap-md', 'q-gap-sm', 'q-grid-1',
  'q-help', 'q-icon-dim', 'q-label-sm', 'q-page', 'q-select-sm', 'q-spin', 'q-take-hover',
  'q-text-meta',
];

function everyTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) everyTsx(path, out);
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** The class names a file writes literally - not the ones it composes. */
function classesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{'([^']*)'\})/g)) {
    for (const token of `${m[1] ?? ''} ${m[2] ?? ''}`.split(/\s+/)) {
      if (token.startsWith('q-')) found.add(token);
    }
  }
  // Class names held in a variable or a ternary: 'q-tab q-tab-on' : 'q-tab'
  for (const m of text.matchAll(/'((?:q-[a-z0-9-]+\s*)+)'/g)) {
    for (const token of m[1].split(/\s+/)) if (token.startsWith('q-')) found.add(token);
  }
  return found;
}

describe('Every class a component writes has a rule', () => {
  const css = readFileSync(CSS, 'utf8');
  const defined = new Set([...css.matchAll(/\.(q-[a-z0-9-]+)/g)].map((m) => m[1]));
  const files = everyTsx(SRC);

  it('finds the stylesheet and the components', () => {
    expect(defined.size).toBeGreaterThan(400);
    expect(files.length).toBeGreaterThan(50);
  });

  it('leaves no class without a rule, beyond the gaps already recorded', () => {
    const missing = new Map<string, string[]>();
    for (const file of files) {
      for (const cls of classesIn(readFileSync(file, 'utf8'))) {
        if (defined.has(cls) || KNOWN_GAPS.includes(cls)) continue;
        missing.set(cls, [...(missing.get(cls) ?? []), file.replace(SRC, 'src')]);
      }
    }
    const said = [...missing.entries()].map(([cls, where]) => `.${cls} (${where.join(', ')})`);
    expect(said, 'a component writes these classes and the stylesheet has no rule for them').toEqual([]);
  });

  it('keeps the recorded gaps honest - a gap that has been styled leaves the list', () => {
    const styled = KNOWN_GAPS.filter((cls) => defined.has(cls));
    expect(styled, 'these are styled now and belong out of KNOWN_GAPS').toEqual([]);
  });

  it('holds the register and the five views in full', () => {
    /*
     * The surfaces the page is made of, named here so their loss is loud. The
     * table went missing precisely because nothing said these had to exist.
     */
    const must = [
      'q-reg-head', 'q-reg-row', 'q-reg-cell', 'q-reg-totals', 'q-reg-group', 'q-reg-scroll',
      'q-reg-bar', 'q-reg-search', 'q-reg-menu', 'q-reg-pop', 'q-reg-steps', 'q-reg-track',
      'q-tabs', 'q-tab', 'q-tab-on',
      'q-cut', 'q-cut-saved', 'q-cut-view', 'q-cut-bar', 'q-cut-chip', 'q-cut-count',
      'q-out-head', 'q-out-row', 'q-out-who', 'q-out-state',
      'q-monthv-grid', 'q-monthv-cell', 'q-monthv-item', 'q-monthv-tray', 'q-monthv-strip',
      'q-board-cols', 'q-board-col', 'q-card', 'q-days-strip', 'q-day-col',
      'q-dist2-axis', 'q-dist2-bar', 'q-dist2-keys', 'q-dist2-measures',
    ];
    expect(must.filter((cls) => !defined.has(cls))).toEqual([]);
  });

  it('declares every colour through a token, on these surfaces', () => {
    /*
     * The one thing a component may not do is carry a colour of its own
     * (08-DESIGN_SYSTEM). A hex or a named colour in a bookings component is a
     * second theme system starting.
     */
    const ours = files.filter((f) => /bookings|Board\.tsx|Readings\.tsx/.test(f));
    const offenders: string[] = [];
    for (const file of ours) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:color|background|border|fill|stroke)[^;\n]{0,40}(#[0-9a-fA-F]{3,8}|\b(?:white|black|red|blue|green)\b)/g)) {
        offenders.push(`${file.replace(SRC, 'src')}: ${m[0].trim()}`);
      }
    }
    expect(offenders, 'a colour must come from a --q- token').toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * THE STUDIO'S WORDS ARE PRINTED AS THE STUDIO WROTE THEM.
 *
 * This is not a style preference. Every word a studio defines - a stage name, a
 * dimension and its values, a question's label, a deliverable, a role, a
 * package - is THEIR vocabulary, and the app is only allowed to supply the
 * connective words between them. Rewriting one is the app telling a studio what
 * its own business is called.
 *
 * It kept happening because it was mechanised in two places rather than typed
 * out each time, which is exactly why intention was never going to be enough:
 *
 *   1. the stylesheet. `text-transform: uppercase` on forty rules, including
 *      `.q-badge` (which draws the studio's stage names, so "Enquiry" rendered
 *      as "ENQUIRY") and `.q-reg-h` (which now draws the studio's own dimension
 *      and deliverable names as column titles, so "Occasion" became "OCCASION").
 *      A decoration cannot be applied slot by slot: sooner or later a studio's
 *      word lands in the slot, and then the decoration is a lie.
 *
 *   2. the components. Ten places re-cased at render: a deliverable lowercased
 *      to fit a sentence, a dimension value uppercased for emphasis, a
 *      dimension's name lowercased inside a placeholder and a screen-reader
 *      label.
 *
 * So both are locked here instead. There is no allowance for "just this one" -
 * that allowance is what produced forty of them.
 */

const ROOTS = ['src/app', 'src/components', 'src/modules', 'src/kernel'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));

/** The kinds of thing a studio names. If one of these is re-cased, it is their word being rewritten. */
const STUDIO_NAMED = /\b\w*(?:name|label|deliverable|unit|question|dimension|stage|role|package|value|values|title)\b\s*(?:\)|\]|\}|\s)*\.to(?:Lower|Upper)Case\(\)/i;

/**
 * The three things that are not display, and why each is allowed:
 *   a monogram is a single letter in a frame, not a word;
 *   a slug or a lookup key is never shown to anyone;
 *   a comparison folds case on both sides and prints neither.
 */
const NOT_DISPLAY = [
  /charAt\(0\)\.toUpperCase\(\)/,
  /replace\(\/\[\^a-z0-9\]/,
  /\[[^\]]*\.to(?:Lower|Upper)Case\(\)\s*\]/,
  /new Set\(/,
  /(?:includes|startsWith|endsWith|indexOf|localeCompare|===|!==)\s*\(?/,
];

describe('the app prints the studio\'s words as the studio wrote them', () => {
  it('never rewrites case in the stylesheet', () => {
    const css = fs.readFileSync('src/app/globals.css', 'utf8');
    const rewrites = [...css.matchAll(/text-transform\s*:\s*(\w+)/g)]
      .map((m) => m[1])
      .filter((v) => v !== 'inherit' && v !== 'none');
    expect(
      rewrites,
      'text-transform rewrites the studio\'s own words wherever one lands in that slot. '
      + 'Use the font, size, weight, colour or letter-spacing for emphasis instead.',
    ).toEqual([]);
  });

  it('never re-cases a word the studio defined', () => {
    const guilty: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!STUDIO_NAMED.test(line)) return;
        if (NOT_DISPLAY.some((ok) => ok.test(line))) return;
        guilty.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(guilty, 'these rewrite a studio\'s own word before printing it').toEqual([]);
  });

  it('never shortens a word the studio defined to make it fit', () => {
    // A name cut to fit a box ("Location Address" printed as "Location") is the
    // layout editing the studio's vocabulary. Narrow columns get a title
    // attribute and CSS ellipsis, which shortens the PICTURE and not the word.
    const cutting = /\b\w*(?:name|label|deliverable|question|dimension|package|title)\b\s*\.(?:slice|substring|substr)\(/i;
    const guilty: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (cutting.test(line)) guilty.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(guilty, 'these cut a studio\'s own word to fit a layout').toEqual([]);
  });
});

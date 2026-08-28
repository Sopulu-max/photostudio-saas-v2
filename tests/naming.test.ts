import { describe, it, expect } from 'vitest';
import { normalizeName, sameName, findByName } from '@/kernel/naming';

/**
 * Matching a name is equality, not pattern matching.
 *
 * Every find-or-create in the app used to ask the database
 * `.ilike('name', typed)` and read a hit as "this already exists". ILIKE is a
 * PATTERN match: `_` matches any single character, `%` any run of them, and
 * PostgREST rewrites `*` to `%` before the query is sent. Probed against the
 * live database, all three of `Photograph_r`, `Photograph%` and `Photograph*r`
 * came back matching the role "Photographer".
 *
 * So naming a second thing could silently hand back the first, with no error
 * anywhere. These tests are the wildcards, held still.
 *
 * No database: this is string comparison, and a test that reaches for the
 * network to check string comparison is testing the network.
 */

describe('Matching a name', () => {
  const rows = [
    { id: 'a', name: 'Post-production' },
    { id: 'b', name: 'Photographer' },
    { id: 'c', name: '4x6 print' },
    { id: 'd', name: 'Lead Photographer' },
  ];

  it('does not treat an underscore as a wildcard', () => {
    // ILIKE matched 'Post-production' for this. It is a different name.
    expect(findByName(rows, 'Post_production')).toBeUndefined();
    expect(findByName(rows, 'Photograph_r')).toBeUndefined();
    // The same class of bug this codebase was already bitten by once.
    expect(findByName(rows, '4_6 print')).toBeUndefined();
  });

  it('does not treat a percent or a star as a wildcard', () => {
    expect(findByName(rows, 'Photograph%')).toBeUndefined();
    expect(findByName(rows, '%')).toBeUndefined();
    // PostgREST rewrites * to % on the way out, so this one never even
    // reached the database as typed.
    expect(findByName(rows, 'Photograph*r')).toBeUndefined();
    expect(findByName(rows, '*')).toBeUndefined();
  });

  it('still matches the same name in any case, with stray space', () => {
    expect(findByName(rows, 'photographer')?.id).toBe('b');
    expect(findByName(rows, '  POST-PRODUCTION  ')?.id).toBe('a');
  });

  it('does not match a name that merely contains it', () => {
    // 'Lead Photographer' contains 'Photographer'. It is not the same role,
    // and a find-or-create that conflated them would put the wrong person on
    // the wrong task.
    expect(findByName(rows, 'Photographer')?.id).toBe('b');
    expect(findByName(rows, 'Lead Photographer')?.id).toBe('d');
  });

  it('answers nothing for an empty name rather than the first row', () => {
    expect(findByName(rows, '')).toBeUndefined();
    expect(findByName(rows, '   ')).toBeUndefined();
    expect(findByName(rows, null)).toBeUndefined();
    expect(findByName(null, 'Photographer')).toBeUndefined();
  });

  it('reads a row with no usable name as no match', () => {
    expect(findByName([{ id: 'x' }, { id: 'y', name: null }], 'Photographer')).toBeUndefined();
  });

  it('normalises and compares consistently', () => {
    expect(normalizeName('  Wedding  ')).toBe('wedding');
    expect(normalizeName(42)).toBe('');
    expect(sameName('Wedding', ' wedding ')).toBe(true);
    expect(sameName('Wedding', 'Wedding Day')).toBe(false);
    // Empty is never the same as anything, including empty — otherwise a blank
    // name would find-or-create against every unnamed row.
    expect(sameName('', '')).toBe(false);
  });
});

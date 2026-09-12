import { describe, it, expect } from 'vitest';
import { parseSize, formatSize, normaliseSize, describeSize, fitSizes } from '../src/modules/services/sizes';
import { FIELD_TYPES, normaliseOptions, isIntakePath } from '../src/modules/services/fieldTypes';
import { SERVICE_VARIABLE_KINDS, parseVariableValue, formatVariableValue } from '../src/modules/services/variableTypes';

/**
 * A size is a shape the engine owns: tolerant on the way in, one spelling in
 * storage, drawn to scale on the way out. No database — the part that matters
 * is that '16x20' typed by a studio and '16×20' declared on a deliverable are
 * the same option, and that nothing reads a word as a size by guessing.
 */
describe('a size is a shape', () => {
  it('reads what a studio types, however they type it', () => {
    for (const raw of ['16x20', '16 x 20', '16×20', '16 X 20', ' 16×20 ', '16,5x20']) {
      expect(parseSize(raw), raw).not.toBeNull();
    }
    expect(parseSize('16,5x20')).toEqual({ width: 16.5, height: 20 });
  });

  it('refuses what is not two positive numbers — a word is a word, never inferred', () => {
    for (const raw of ['A4', 'Poster', '16', '0x20', '16x', 'x20', '', null, 42]) {
      expect(parseSize(raw as any), String(raw)).toBeNull();
    }
  });

  it('stores one spelling', () => {
    expect(normaliseSize('16x20')).toBe('16×20');
    expect(normaliseSize('16 X 20')).toBe('16×20');
    expect(normaliseSize('16.50x20')).toBe('16.5×20');
    expect(formatSize({ width: 8, height: 10 })).toBe('8×10');
  });

  it('leaves a word it cannot read rather than eating it', () => {
    expect(normaliseSize('A4')).toBe('A4');
    expect(normaliseSize('  Poster ')).toBe('Poster');
  });

  it('reads to a person with the unit said once, never pluralised', () => {
    expect(describeSize('16×20', 'in')).toBe('16 × 20 in');
    expect(describeSize('16x20', null)).toBe('16 × 20');
    expect(describeSize('A4', 'in')).toBe('A4');
  });

  it('scales every option to one box so the largest fills it and the rest keep their proportion', () => {
    const fitted = fitSizes(['8×10', '16×20', 'A4'], 100);
    const big = fitted.find((f) => f.option === '16×20')!;
    const small = fitted.find((f) => f.option === '8×10')!;
    const word = fitted.find((f) => f.option === 'A4')!;
    expect(big.h).toBe(100);
    expect(big.w).toBe(80);
    expect(small.h).toBe(50);
    expect(small.w).toBe(40);
    expect(word.size).toBeNull();
    expect(word.w).toBe(0);
  });
});

describe('the registry knows the two new shapes', () => {
  it('a size is a variable kind and a file is not', () => {
    expect(SERVICE_VARIABLE_KINDS).toContain('size');
    expect(SERVICE_VARIABLE_KINDS).not.toContain('file');
    expect(FIELD_TYPES.size.needsOptions).toBe(true);
    expect(FIELD_TYPES.file.needsOptions).toBe(false);
  });

  it('a size answer must be one of the sizes offered, compared in canonical form', () => {
    const q = { id: 'q', type: 'size' as const, label: 'Print size', options: ['8x10', '16×20'] };
    expect(FIELD_TYPES.size.validate('16x20', q)).toBeNull();
    expect(FIELD_TYPES.size.validate('16 × 20', q)).toBeNull();
    expect(FIELD_TYPES.size.validate('11x14', q)).toMatch(/isn't one of the sizes/);
    expect(FIELD_TYPES.size.store('16 x 20')).toBe('16×20');
    expect(FIELD_TYPES.size.display('16×20')).toBe('16 × 20');
  });

  it('declared options are settled to one spelling, once, wherever they were typed', () => {
    expect(normaliseOptions('size', ['16x20', '16 × 20', ' 8x10 ', 'A4', ''])).toEqual(['16×20', '8×10', 'A4']);
    // Every other kind is left as typed — a choice called '16x20' is a word.
    expect(normaliseOptions('choice', ['16x20', ' Black '])).toEqual(['16x20', 'Black']);
  });

  it('a variable value parses and formats as a size', () => {
    expect(parseVariableValue('size', '16 x 20')).toBe('16×20');
    expect(parseVariableValue('size', '')).toBeNull();
    expect(formatVariableValue({ value: '16×20', unit: 'in', kind: 'size' })).toBe('16 × 20 in');
    // Without the kind, a size value is still not pluralised into nonsense
    // only because callers now pass the kind — this is the failure it guards.
    expect(formatVariableValue({ value: 2, unit: 'outfit', kind: 'number' })).toBe('2 outfits');
  });

  it('a file answer is only ever a path this form issued', () => {
    expect(isIntakePath('intake/org-1/abc-photo.jpg')).toBe(true);
    expect(isIntakePath('intake/')).toBe(false);
    expect(isIntakePath('deliveries/org-1/x.jpg')).toBe(false);
    expect(isIntakePath('intake/org-1/../org-2/x.jpg')).toBe(false);
    expect(isIntakePath('https://example.com/x.jpg')).toBe(false);
    const q = { id: 'q', type: 'file' as const, label: 'The image to print', required: true };
    expect(FIELD_TYPES.file.validate('', q)).toMatch(/required/);
    expect(FIELD_TYPES.file.validate('https://x', q)).toMatch(/did not upload/);
    expect(FIELD_TYPES.file.validate('intake/org-1/abc.jpg', q)).toBeNull();
  });

  it('a file reads back as its name, not the id the server put in front of it', () => {
    expect(FIELD_TYPES.file.display('intake/org-1/3f2b1c4d-1111-4222-8333-444455556666-holiday photo.jpg'))
      .toBe('holiday photo.jpg');
    expect(FIELD_TYPES.file.display('intake/org-1/plain.pdf')).toBe('plain.pdf');
  });
});

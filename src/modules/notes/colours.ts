/**
 * The colours a note can be.
 *
 * Lumen's seven hues, by name — the same seven `globals.css` defines twice, once
 * light and once dark, and the same seven the badges already tint with. A note
 * stores the NAME, never a hex: the row holds a reference to the design system
 * rather than a copy of one moment of it, so a note coloured amber is amber in
 * both themes and stays right if the ramp is ever retuned.
 *
 * Its own file rather than `domain.ts`, because that module is `'use server'`
 * and a server module may export only async functions. A type survives there —
 * types are erased — but this list has to exist at runtime, in the browser,
 * where the swatches are drawn.
 *
 * Adding an eighth means adding it here, in the database's check constraint,
 * and as a `--q-hue-` token. Three places, on purpose: a colour that is not all
 * three is a note that exists and looks broken.
 */
export type NoteColour = 'amber' | 'green' | 'blue' | 'violet' | 'teal' | 'rose' | 'red';

export const NOTE_COLOURS: readonly NoteColour[] =
  ['amber', 'green', 'blue', 'violet', 'teal', 'rose', 'red'] as const;

/** What the swatch says out loud, for anyone not reading it by eye. */
export const NOTE_COLOUR_NAMES: Record<NoteColour, string> = {
  amber: 'Amber',
  green: 'Green',
  blue: 'Blue',
  violet: 'Violet',
  teal: 'Teal',
  rose: 'Rose',
  red: 'Red',
};

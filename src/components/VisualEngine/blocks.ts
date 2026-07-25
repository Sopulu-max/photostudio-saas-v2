import type { VisualNode } from './Renderer';

/**
 * The block palette — the single source for what a studio can drop onto the
 * canvas, and the premium Lumen defaults each block drops in with (so anything
 * you add already looks good: the "constrained freedom" rule).
 *
 * Both the builder's palette (Sidebar) and the drop logic (Builder) read this.
 */

export type BlockType = 'Heading' | 'Text' | 'Image' | 'Button' | 'Container';

export interface BlockDef {
  type: BlockType;
  label: string;
  hint: string;
  /** A fresh node (without id) with premium defaults. */
  make: () => Omit<VisualNode, 'id'>;
}

// A calm placeholder so an Image block looks intentional before a real upload.
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23ECEAE3'/%3E%3C/svg%3E";

export const BLOCKS: BlockDef[] = [
  {
    type: 'Heading',
    label: 'Heading',
    hint: 'A bold title',
    make: () => ({
      type: 'Heading',
      props: {
        level: 2,
        text: 'A headline that sells',
        style: {
          fontSize: '2.2rem',
          fontWeight: 680,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          color: 'var(--q-color-ink-900)',
          margin: 0,
          padding: '40px 40px 12px',
        },
      },
    }),
  },
  {
    type: 'Text',
    label: 'Text',
    hint: 'A paragraph',
    make: () => ({
      type: 'Text',
      props: {
        text: 'Describe what makes this service special — in a sentence or two.',
        style: {
          display: 'block',
          fontSize: '1.05rem',
          lineHeight: 1.6,
          color: 'var(--q-color-ink-600)',
          margin: 0,
          padding: '0 40px 24px',
        },
      },
    }),
  },
  {
    type: 'Image',
    label: 'Image',
    hint: 'A full-width photo',
    make: () => ({
      type: 'Image',
      props: {
        src: IMG_PLACEHOLDER,
        alt: '',
        style: { width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover' },
      },
    }),
  },
  {
    type: 'Button',
    label: 'Button',
    hint: 'A call to action',
    make: () => ({
      type: 'Button',
      props: {
        text: 'Book this service',
        className: 'q-btn-primary',
        style: { margin: '8px 40px 40px' },
      },
    }),
  },
  {
    type: 'Container',
    label: 'Section',
    hint: 'A group of blocks',
    make: () => ({
      type: 'Container',
      props: { style: { padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '16px' } },
      children: [],
    }),
  },
];

export function makeBlock(type: BlockType): Omit<VisualNode, 'id'> | null {
  const def = BLOCKS.find((b) => b.type === type);
  return def ? def.make() : null;
}

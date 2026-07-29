/**
 * How a stage looks.
 *
 * A studio may pick a colour per stage; if it hasn't, the colour falls back to a
 * sensible default for the stage's KIND. Either way the value is a palette name,
 * not a hex — the token behind it flips with the theme, so contrast holds.
 */
export const STAGE_COLORS = ['amber', 'green', 'blue', 'violet', 'teal', 'rose', 'red', 'slate'] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

/** What each kind looks like when the studio hasn't chosen. */
const DEFAULT_FOR_KIND: Record<string, StageColor> = {
  enquiry: 'amber',
  booked: 'green',
  completed: 'slate',
  cancelled: 'red',
};

export type StageLook = { kind?: string | null; color?: string | null } | null | undefined;

export function stageColor(stage: StageLook): StageColor {
  const chosen = stage?.color as StageColor | undefined;
  if (chosen && (STAGE_COLORS as readonly string[]).includes(chosen)) return chosen;
  return DEFAULT_FOR_KIND[stage?.kind || ''] || 'slate';
}

export function stageBadgeClass(stage: StageLook): string {
  return `q-badge-c-${stageColor(stage)}`;
}

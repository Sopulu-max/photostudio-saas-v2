/**
 * How a stage looks, driven by its KIND — never its name.
 * A studio can rename "Booked" to anything; the colour still follows meaning.
 */
export const STAGE_BADGE: Record<string, string> = {
  enquiry:   'q-badge-warning',
  booked:    'q-badge-success',
  completed: 'q-badge-neutral',
  cancelled: 'q-badge-danger',
};

export function stageBadgeClass(kind?: string | null) {
  return STAGE_BADGE[kind || ''] || 'q-badge-neutral';
}

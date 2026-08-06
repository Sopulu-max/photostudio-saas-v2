import Link from 'next/link';
import type { Dimension } from '@/modules/services/interface';

const LABELS: Record<Dimension, string> = {
  subject: 'Subject', occasion: 'Occasion', context: 'Context', purpose: 'Purpose', client: 'Client',
};

/**
 * Connective tissue between a classification value and the dimension it
 * belongs to — "Outdoor" on its own doesn't say it's a Context; this shows
 * "Context: Outdoor" and makes it a way back up into that classification
 * (every other Service tagged the same way), not just a bare label.
 */
export function DimensionTag({ dim, value }: { dim: Dimension; value: { id: string; name: string } | null | undefined }) {
  if (!value?.id) return null;
  const href = `/services?dim=${dim}&id=${encodeURIComponent(value.id)}&label=${encodeURIComponent(value.name)}`;
  return (
    <Link href={href} className="q-badge q-badge-neutral" title={`See every service tagged ${LABELS[dim]}: ${value.name}`}>
      {LABELS[dim]}: {value.name}
    </Link>
  );
}

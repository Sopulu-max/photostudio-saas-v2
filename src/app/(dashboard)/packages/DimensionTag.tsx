import Link from 'next/link';

/**
 * Connective tissue between a classification value and the dimension it
 * belongs to — "Outdoor" on its own doesn't say it's a Context; this shows
 * "Context: Outdoor" and makes it a way back up into that classification
 * (every other Package tagged the same way), not just a bare label.
 *
 * The link carries the value id alone: a value belongs to exactly one
 * dimension of exactly one domain, so the id already says which question it
 * answers.
 */
export function DimensionTag({
  dimension, value,
}: {
  dimension: string;
  value: { id: string; name: string } | null | undefined;
}) {
  if (!value?.id) return null;
  const href = `/packages?value=${encodeURIComponent(value.id)}&label=${encodeURIComponent(`${dimension}: ${value.name}`)}`;
  return (
    <Link href={href} className="q-badge q-badge-neutral" title={`See every package tagged ${dimension}: ${value.name}`}>
      {dimension}: {value.name}
    </Link>
  );
}

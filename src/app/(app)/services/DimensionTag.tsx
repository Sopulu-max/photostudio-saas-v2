import Link from 'next/link';

/**
 * Connective tissue between a classification value and the dimension it
 * belongs to — "Outdoor" on its own doesn't say it's a Context; this shows
 * "Context: Outdoor" and makes it a way back up into that classification
 * (every other Service tagged the same way), not just a bare label.
 *
 * The link carries the value id alone. A value belongs to exactly one
 * dimension of exactly one domain, so the id already says which question it
 * answers — passing the dimension alongside it would be storing the same fact
 * twice.
 */
export function DimensionTag({
  dimension, value,
}: {
  dimension: string;
  value: { id: string; name: string } | null | undefined;
}) {
  if (!value?.id) return null;
  // Straight to the classification, which answers far more than the filtered
  // service list this used to point at: the services carrying it, the packages,
  // the bookings that resulted, and what tends to come with it. The thin read
  // was the one wired into every badge in the app, and the rich one could only
  // be reached from a menu.
  const href = `/services/classifications/${encodeURIComponent(value.id)}`;
  return (
    <Link href={href} className="q-badge q-badge-neutral" title={`See every service tagged ${dimension}: ${value.name}`}>
      {dimension}: {value.name}
    </Link>
  );
}

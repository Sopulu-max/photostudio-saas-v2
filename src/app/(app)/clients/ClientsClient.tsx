'use client';

import { CatalogFilter } from '@/components/CatalogFilter';
import { Sheet, initialsFor, type SheetItem } from '@/components/Sheet';

/**
 * Who the studio works with, as a sheet.
 *
 * It was a table with no way through: name, contact, a count, a status
 * badge, an Open button - and twenty rows already. The same list with the
 * same narrowing every other list has, drawn by the shared Sheet (D1, D4).
 *
 * The frame is the person's photograph or their initials, which is what
 * ContactAvatar has always drawn for them. The caption is how to reach them
 * and how much work they have brought. The status is said only when it says
 * something - "active" on every client is a badge that means nothing.
 */
export function ClientsClient({
  clients,
  bookingCounts,
}: {
  clients: any[];
  bookingCounts: Record<string, number>;
}) {
  const count = (c: any) => bookingCounts[c.contact?.id] || 0;

  const HOW_TO_ORDER = [
    { key: 'name', label: 'By name',
      compare: (a: any, b: any) => (a.contact?.display_name || '').localeCompare(b.contact?.display_name || '') },
    { key: 'work', label: 'Most bookings',
      compare: (a: any, b: any) => count(b) - count(a)
        || (a.contact?.display_name || '').localeCompare(b.contact?.display_name || '') },
  ];

  const item = (c: any): SheetItem => {
    const name = c.contact?.display_name || 'Unnamed';
    const n = count(c);
    return {
      id: c.id,
      href: `/clients/${c.id}`,
      name,
      caption: [
        c.contact?.email || c.contact?.phone || null,
        n > 0 ? `${n} ${n === 1 ? 'booking' : 'bookings'}` : null,
      ],
      absent: 'No contact details or bookings yet',
      frame: { url: c.contact?.avatar_url, initials: initialsFor(name) },
      badge: c.status && c.status !== 'active'
        ? <span className="q-badge q-badge-neutral">{c.status}</span>
        : undefined,
      dim: Boolean(c.status && c.status !== 'active'),
    };
  };

  return (
    <CatalogFilter
      items={clients}
      noun="client"
      kind="catalogue"
      sorts={HOW_TO_ORDER}
      views
      read={(c: any) => ({
        name: c.contact?.display_name || '',
        description: [c.contact?.email, c.contact?.phone].filter(Boolean).join(' '),
        facet: null,
        tags: [],
      })}
    >
      {(shown, { dense }) => <Sheet items={shown.map(item)} dense={dense} />}
    </CatalogFilter>
  );
}

import Link from 'next/link';

/**
 * The studio's own way around.
 *
 * Deliberately not in the root layout: the client's gallery and the login page
 * share that layout and neither should carry the studio's navigation. A page
 * nothing links to is a page nobody finds, so every studio screen renders this.
 */
export function StudioNav({ here }: { here: 'board' | 'orders' | 'store' }) {
  const items: { key: 'board' | 'orders' | 'store'; href: string; label: string }[] = [
    { key: 'board', href: '/', label: 'The board' },
    { key: 'orders', href: '/orders', label: 'Orders' },
    { key: 'store', href: '/store', label: 'What you sell' },
  ];

  return (
    <nav className="q-row q-row-sm">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={i.key === here ? 'q-btn q-btn-secondary q-btn-sm' : 'q-btn q-btn-ghost q-btn-sm'}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

import Link from 'next/link';

/**
 * The studio's own way around.
 *
 * Deliberately not in the root layout: the client's gallery and the login page
 * share that layout and neither should carry the studio's navigation. A page
 * nothing links to is a page nobody finds, so every studio screen renders this.
 */
type Where = 'board' | 'orders' | 'store' | 'automations';

export function StudioNav({ here }: { here: Where }) {
  const items: { key: Where; href: string; label: string }[] = [
    { key: 'board', href: '/', label: 'The board' },
    { key: 'orders', href: '/orders', label: 'Orders' },
    { key: 'store', href: '/store', label: 'What you sell' },
    { key: 'automations', href: '/automations', label: 'Following up' },
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

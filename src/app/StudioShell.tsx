import Link from 'next/link';
import {
  LayoutGrid, ShoppingBag, Tag, Send, Images, Smartphone, CalendarPlus,
} from 'lucide-react';
import { signOut } from '@/weave/account/actions';

/**
 * The studio's shell: a sidebar and a page beside it.
 *
 * This replaces a row of buttons in a header. A row of buttons is fine for
 * three screens and stops being fine at five, and it never told you where you
 * were — only where you could go.
 *
 * Not in the root layout, deliberately: the client's gallery and the login page
 * share that layout and neither should carry the studio's furniture.
 */
export type Where =
  | 'board' | 'bookings' | 'orders' | 'store' | 'automations' | 'galleries' | 'mobile';

const NAV: { key: Where; href: string; label: string; Icon: typeof LayoutGrid }[] = [
  { key: 'board', href: '/', label: 'The board', Icon: LayoutGrid },
  { key: 'mobile', href: '/mobile', label: 'Today', Icon: Smartphone },
  // Where work arrives from outside. Second, because it comes before the work.
  { key: 'bookings', href: '/bookings', label: 'Bookings', Icon: CalendarPlus },
  { key: 'galleries', href: '/galleries', label: 'Galleries', Icon: Images },
  { key: 'orders', href: '/orders', label: 'Orders', Icon: ShoppingBag },
  { key: 'store', href: '/store', label: 'What you sell', Icon: Tag },
  { key: 'automations', href: '/automations', label: 'Following up', Icon: Send },
];

export function StudioShell({
  here, studioName, children,
}: {
  here: Where;
  studioName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="q-shell">
      <aside className="q-sidebar">
        <Link href="/" className="q-side-head">
          <span className="q-side-name">{studioName}</span>
          <span className="q-eyebrow">Studio</span>
        </Link>

        <nav className="q-side-nav">
          {NAV.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              className={key === here ? 'q-side-item q-side-item-on' : 'q-side-item'}
              aria-current={key === here ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        {/*
          * A form, not a link. This was a link to /login, which ended no
          * session — it only moved the operator to a page that would have
          * signed them straight back in from the cookie they still held.
          */}
        <div className="q-side-foot">
          <form action={signOut}>
            <button type="submit" className="q-side-out">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="q-shell-body">
        <main className="q-shell-main">{children}</main>
      </div>
    </div>
  );
}

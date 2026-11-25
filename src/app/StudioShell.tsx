import Link from 'next/link';
import { signOut } from '@/weave/account/actions';
import { ThemeToggle } from '@/components/Theme';
import { APPS, type Where } from './apps';

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
export type { Where };

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

        {/*
          * No Home item. The studio's name at the top of this sidebar is the
          * link to the apps page, and naming it twice is chrome about chrome.
          */}
        <nav className="q-side-nav">
          {APPS.map(({ key, href, label, Icon }) => (
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
        <div className="q-side-foot q-stack q-stack-sm">
          <ThemeToggle />
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

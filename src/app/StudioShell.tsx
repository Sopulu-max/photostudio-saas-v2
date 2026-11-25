import Link from 'next/link';
import { signOut } from '@/weave/account/actions';
import { ThemeToggle } from '@/components/Theme';
import { SideNav } from './SideNav';

/**
 * The studio's shell: a sidebar and a page beside it.
 *
 * Mounted by the (studio) layout, once, so it survives navigation rather than
 * being rebuilt by every page. Not in the ROOT layout, deliberately: the
 * client's gallery, the storefront and the sign-in pages share that one and
 * none of them should carry a studio's furniture.
 */
export function StudioShell({
  studioName, children,
}: {
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
          *
          * A client component, so the highlight follows the press rather than
          * the server.
          */}
        <SideNav />

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

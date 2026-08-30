'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import TopBar from './TopBar';
import type { Notification } from '@/kernel/notificationKinds';

/**
 * The frame every signed-in page sits in.
 *
 * WHY IT EXISTS. The frame was a row of two inline-styled boxes in the layout:
 * a 220px sidebar and everything else. On a phone that arithmetic does not
 * change — the sidebar keeps its 220px out of 375, the page is left with what
 * remains, and the result is a column so narrow that the word "Packages" is cut
 * off and every sentence wraps one word at a time. The app was not narrow on a
 * phone; it was unusable.
 *
 * A layout that reacts to its width needs to know its own state, and a server
 * component cannot hold any. So the frame is a client component now, and the
 * layout's job is to fetch the studio and hand it over.
 *
 * BELOW THE BREAKPOINT THE SIDEBAR LEAVES THE ROW. It becomes a drawer over the
 * page rather than a column beside it, which is the only arrangement that gives
 * a phone its whole width back. Above it, nothing changes: the same sticky
 * column that was always there.
 *
 * It closes on navigation. A drawer that stays open after you have chosen where
 * to go leaves you looking at the menu you just used instead of the page you
 * asked for.
 */
export function AppShell({
  studioName,
  orgSlug,
  studioLogo,
  notifications,
  unreadCount,
  organizationId,
  contactId,
  children,
}: {
  studioName: string;
  orgSlug?: string;
  studioLogo?: string;
  notifications: Notification[];
  unreadCount: number;
  organizationId?: string;
  contactId?: string | null;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setNavOpen(false); }, [pathname]);

  // Escape closes it, because a thing covering the page has to be dismissible
  // without hunting for the control that dismisses it.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="q-shell">
      <div className={navOpen ? 'q-shell-nav q-shell-nav-open' : 'q-shell-nav'}>
        <Sidebar studioName={studioName} orgSlug={orgSlug} studioLogo={studioLogo} />
      </div>

      {/* Only ever present while the drawer is, so it cannot swallow a click on
          a wide screen where the sidebar is simply part of the row. */}
      {navOpen && (
        <button
          type="button"
          className="q-shell-scrim"
          aria-label="Close the menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="q-shell-body">
        <TopBar
          studioName={studioName}
          notifications={notifications}
          unreadCount={unreadCount}
          organizationId={organizationId}
          contactId={contactId}
          onOpenNav={() => setNavOpen(true)}
        />
        <main className="q-shell-main">
          <div className="q-shell-measure">{children}</div>
        </main>
      </div>
    </div>
  );
}

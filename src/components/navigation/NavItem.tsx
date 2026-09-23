'use client';

import React from 'react';
import Link, { useLinkStatus } from 'next/link';

/**
 * A NAVIGATION ITEM THAT ANSWERS THE MOMENT IT IS PRESSED.
 *
 * The sidebar took its active state from usePathname, which only changes once
 * the next page has arrived. So a click did nothing at all - no highlight, no
 * movement, nothing - for as long as the server took. The app was working and
 * looked asleep, which is the whole of the difference between an app and a
 * website: not how long a thing takes, but whether it answers.
 *
 * useLinkStatus (Next 16) reports the pending state of the navigation this link
 * started, so the item can take the active look immediately and say it is
 * working. The real active state still comes from the path, so if the
 * navigation is abandoned nothing is left highlighted wrongly.
 */

function Pending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? 'q-side-inner q-side-inner-going' : 'q-side-inner'}>
      {children}
      {pending && <i className="q-side-going" aria-hidden="true" />}
    </span>
  );
}

export function NavItem({ href, label, active, icon: Icon }: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <Link href={href} className={active ? 'q-side-item q-side-item-on' : 'q-side-item'}>
      <Pending>
        <Icon size={16} />
        <span className="q-side-label">{label}</span>
      </Pending>
    </Link>
  );
}

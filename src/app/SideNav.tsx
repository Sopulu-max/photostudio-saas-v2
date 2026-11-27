'use client';

import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { APPS } from './apps';

/**
 * The press, acknowledged before anything has been read.
 *
 * `usePathname` only changes when the router COMMITS a navigation, which
 * measured at around a second — a second in which the operator had pressed
 * something and been told nothing. `useLinkStatus` reports pending in the
 * same frame as the click, which is the difference between "did that work"
 * and "it is working".
 *
 * It has to be a descendant of the Link to see its state, so the item itself
 * is tinted with :has() rather than by passing anything back up.
 */
function Waiting() {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? 'q-side-wait q-side-waiting' : 'q-side-wait'} aria-hidden="true" />
  );
}

/**
 * Where you are, decided on the client.
 *
 * This used to be a prop each page passed to the shell, which meant the
 * highlight moved only when the SERVER had finished — two to five seconds
 * after the press, on measurement. An operator clicked Packages and nothing
 * whatsoever acknowledged it.
 *
 * `usePathname` updates the moment the navigation starts, so the item lights
 * up under the finger and the waiting that follows is waiting for CONTENT
 * rather than waiting to find out whether the click registered. Nothing here
 * reaches the database; it is a string comparison, and it is the cheapest
 * honesty in the app.
 */
export function SideNav() {
  const path = usePathname();

  return (
    <nav className="q-side-nav">
      {APPS.map(({ key, href, label, Icon }) => {
        /*
         * A nested page is still that section: /bookings/abc is a booking, and the
         * sidebar should not go blank while you are looking at one. Home is
         * exact, because every path starts with "/".
         */
        const here = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            className={here ? 'q-side-item q-side-item-on' : 'q-side-item'}
            aria-current={here ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            {label}
            <Waiting />
          </Link>
        );
      })}
    </nav>
  );
}

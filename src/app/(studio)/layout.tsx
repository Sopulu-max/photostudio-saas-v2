import { redirect } from 'next/navigation';
import { StudioShell } from '../StudioShell';
import { whoIsAsking } from '@/weave/studio';

/**
 * The studio's chrome, mounted once.
 *
 * Every one of these pages used to render the sidebar itself, which meant
 * every navigation tore it down and built it again — and made a loading state
 * impossible, because a `loading.tsx` would have appeared WITHOUT the
 * sidebar: the chrome vanishing and returning, which reads worse than no
 * loading state at all.
 *
 * In a layout it survives navigation. React keeps it mounted, only the page
 * beneath it changes, and `loading.tsx` can then fill that space with the
 * shape of what is coming while the shell stays exactly where it is. That is
 * the difference between an app and a website, and it is structural rather
 * than decorative.
 *
 * A route group, so the URLs are untouched: this is /packages, not
 * /(studio)/packages. The client's gallery, the storefront and the sign-in
 * pages sit outside it and carry none of this furniture.
 */
export const dynamic = 'force-dynamic';

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * One guard for every studio page. Each page used to repeat this, and a
   * page that forgot it would have rendered a studio's data to anybody.
   */
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  return <StudioShell studioName={who.studioName}>{children}</StudioShell>;
}

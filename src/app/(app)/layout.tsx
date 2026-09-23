import { AppShell } from '@/components/navigation/AppShell';
import { getStudio } from '@/kernel/organizations';
import { listNotifications } from '@/kernel/notifications';
import type { Notification } from '@/kernel/notificationKinds';
import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let studioName = 'Studio OS';
  let orgSlug: string | undefined;
  let notifications: Notification[] = [];

  let studioLogo: string | undefined;

  // Optional auth here on purpose: the chrome renders either way, so a signed
  // -out visitor gets the shell rather than an exception.
  const authOrg = await getOptionalAuthOrgId();
  if (authOrg?.orgId) {
    /*
     * BOTH AT ONCE, because this is paid on every move.
     *
     * Whose studio this is and what is waiting are unrelated questions, and
     * they were asked one after the other. This is the chrome around every
     * page in the app, and it is read again on a fresh load and after any
     * action that refreshes the page - so a wait here is a wait added to
     * everything, not to one screen.
     *
     * The notifications are as fresh as the page around them, which is the
     * honest ceiling of a pull model: they update when you move, not while
     * you sit still.
     */
    const [org, waiting] = await Promise.all([getStudio(), listNotifications(20)]);
    if (org?.name) studioName = org.name;
    if (org?.slug) orgSlug = org.slug;
    if ((org?.metadata as any)?.logo_url) studioLogo = (org?.metadata as any).logo_url;
    notifications = waiting;
  }

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    /*
     * The frame is a client component because a layout that reacts to its own
     * width has to hold state, and a server component cannot. This page's job
     * is to fetch the studio and hand it over.
     */
    <AppShell
      studioName={studioName}
      orgSlug={orgSlug}
      studioLogo={studioLogo}
      notifications={notifications}
      unreadCount={unreadCount}
      organizationId={authOrg?.orgId}
      contactId={authOrg?.contactId}
    >
      {children}
    </AppShell>
  );
}

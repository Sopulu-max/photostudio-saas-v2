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
    const org = await getStudio();
    if (org?.name) studioName = org.name;
    if (org?.slug) orgSlug = org.slug;
    if ((org?.metadata as any)?.logo_url) studioLogo = (org?.metadata as any).logo_url;
    // The chrome is force-dynamic, so this is as fresh as the page around it.
    // That is the honest ceiling of a pull model: it updates when you move,
    // not while you sit still.
    notifications = await listNotifications(20);
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

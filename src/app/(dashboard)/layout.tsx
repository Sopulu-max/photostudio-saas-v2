import { Sidebar } from '@/components/navigation/Sidebar';
import TopBar from '@/components/navigation/TopBar';
import { getStudio } from '@/kernel/organizations';
import { listNotifications } from '@/kernel/notifications';
import type { Notification } from '@/kernel/notifications';
import { getOptionalAuthOrgId } from '@/lib/supabase/getOrgId';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let studioName = 'Studio OS';
  let orgSlug: string | undefined;
  let notifications: Notification[] = [];

  // Optional auth here on purpose: the chrome renders either way, so a signed
  // -out visitor gets the shell rather than an exception.
  const authOrg = await getOptionalAuthOrgId();
  if (authOrg?.orgId) {
    const org = await getStudio();
    if (org?.name) studioName = org.name;
    if (org?.slug) orgSlug = org.slug;
    // The chrome is force-dynamic, so this is as fresh as the page around it.
    // That is the honest ceiling of a pull model: it updates when you move,
    // not while you sit still.
    notifications = await listNotifications(20);
  }

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>
      <Sidebar studioName={studioName} orgSlug={orgSlug} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar
          studioName={studioName}
          notifications={notifications}
          unreadCount={unreadCount}
          organizationId={authOrg?.orgId}
          contactId={authOrg?.contactId}
        />
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listClients } from '@/modules/clients/interface';
import { ContactAvatar } from '@/components/ContactAvatar';
import { NewClientForm } from './NewClientForm';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  let orgId: string;
  try {
    orgId = (await getAuthOrgId()).orgId;
  } catch {
    redirect('/login');
  }

  const clients = await listClients();

  // Booking counts per contact, so the list shows real activity at a glance.
  const { data: bookingRows } = await supabaseAdmin
    .from('bookings')
    .select('contact_id')
    .eq('organization_id', orgId)
    .not('contact_id', 'is', null);
  const bookingCounts = new Map<string, number>();
  for (const b of bookingRows || []) {
    bookingCounts.set(b.contact_id, (bookingCounts.get(b.contact_id) || 0) + 1);
  }

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Clients</h1>
          <p className="q-page-subtitle">Who you work with — every booking starts with one of these.</p>
        </div>
        <NewClientForm />
      </header>

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th"></th>
              <th className="q-table-th">Client</th>
              <th className="q-table-th">Contact</th>
              <th className="q-table-th">Bookings</th>
              <th className="q-table-th">Status</th>
              <th className="q-table-th"></th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="q-table-td q-center-text q-muted">
                  No clients yet. Add one, or they'll appear here when a booking comes in.
                </td>
              </tr>
            ) : (
              clients.map((c: any) => (
                <tr key={c.id} className="q-table-tr">
                  <td className="q-table-td" style={{ width: '1%' }}>
                    <ContactAvatar name={c.contact?.display_name || ''} url={c.contact?.avatar_url} size="sm" />
                  </td>
                  <td className="q-table-td q-strong">
                    <Link href={`/clients/${c.id}`} className="q-plain-link">{c.contact?.display_name}</Link>
                  </td>
                  <td className="q-table-td q-meta">
                    {c.contact?.email || c.contact?.phone || '—'}
                  </td>
                  <td className="q-table-td q-num">
                    {bookingCounts.get(c.contact?.id) || 0}
                  </td>
                  <td className="q-table-td">
                    <span className={`q-badge ${c.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{c.status}</span>
                  </td>
                  <td className="q-table-td" style={{ textAlign: 'right' }}>
                    <Link href={`/clients/${c.id}`} className="q-btn q-btn-secondary q-btn-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

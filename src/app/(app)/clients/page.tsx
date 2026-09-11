import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listClients } from '@/modules/clients/interface';
import { getBookingCountsByContact } from '@/modules/bookings/interface';
import { NewClientForm } from './NewClientForm';
import { ClientsClient } from './ClientsClient';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  // How much work each client has is Bookings' answer to give, not something
  // this page counts for itself.
  const [clients, bookingCounts] = await Promise.all([listClients(), getBookingCountsByContact()]);

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Clients</h1>
          <p className="q-page-subtitle">Who you work with — every booking starts with one of these.</p>
        </div>
        <NewClientForm />
      </header>

      {clients.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <h3 className="q-section-title">No clients yet</h3>
          <p className="q-meta">Add one, or they appear here when a booking comes in.</p>
        </div>
      ) : (
        <ClientsClient clients={clients} bookingCounts={bookingCounts} />
      )}
    </div>
  );
}

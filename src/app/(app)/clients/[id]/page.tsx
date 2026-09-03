import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getClient } from '@/modules/clients/interface';
import { listBookingsForContact } from '@/modules/bookings/interface';
import { getPaymentSummaryForContact } from '@/modules/finances/interface';
import { formatMoney } from '@/kernel/currency';
import { stageBadgeClass } from '@/components/stageBadge';
import { AvatarUpload } from '@/components/AvatarUpload';
import { ClientEditor } from './ClientEditor';
import { NotesFor } from '@/components/NotesFor';
import { listNotesAbout } from '@/modules/notes/interface';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const client: any = await getClient(params.id);
  if (!client) notFound();

  const [bookings, payments, notes] = await Promise.all([
    listBookingsForContact(client.contact.id),
    getPaymentSummaryForContact(client.contact.id),
    // The studio's own record of this person, as opposed to their details.
    listNotesAbout({ type: 'client', id: params.id }),
  ]);

  const lifetimeValue = bookings.reduce((sum: number, b: any) => sum + b.total, 0);
  const currency = payments.currency || bookings[0]?.currency || 'USD';

  return (
    <div className="q-page-narrow">
      <Link href="/clients" className="q-back">&larr; Back to Clients</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{client.contact?.display_name}</h1>
          <p className="q-page-subtitle">{client.contact?.email || client.contact?.phone || 'No contact details'}</p>
        </div>
        <span className={`q-badge ${client.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
          {client.status}
        </span>
      </header>

      <div className="q-stack q-stack-lg">

        <div className="q-card q-section">
          <AvatarUpload contactId={client.contact.id} name={client.contact?.display_name || ''} url={client.contact?.avatar_url ?? null} />
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">At a glance</h2>
          <div className="q-grid-3">
            <div className="q-panel">
              <div className="q-stat-label">Bookings</div>
              <div className="q-stat-value q-num">{bookings.length}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Lifetime value</div>
              <div className="q-stat-value">{formatMoney(lifetimeValue, currency)}</div>
            </div>
            <div className="q-panel">
              <div className="q-stat-label">Paid to date</div>
              <div className="q-stat-value">{formatMoney(payments.paid, currency)}</div>
              {payments.pending > 0 && <span className="q-meta-sm">{formatMoney(payments.pending, currency)} pending</span>}
            </div>
          </div>
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Details</h2>
          <ClientEditor
            clientId={client.id}
            name={client.contact?.display_name || ''}
            email={client.contact?.email}
            phone={client.contact?.phone}
            tags={client.tags || []}
            source={client.source}
            status={client.status}
          />
        </div>

        {/*
          * WHAT THE STUDIO KNOWS ABOUT THIS CLIENT.
          *
          * This replaces a "Notes" textarea that sat inside the details form —
          * one box, saved with the record, empty on every client in the
          * database. It could hold one thought at a time, undated and
          * unattributed, and it was a second answer to a question the notes app
          * now answers properly.
          */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Notes</h2>
          <NotesFor
            about={{ type: 'client', id: client.id }}
            aboutLabel={client.contact?.display_name || 'this client'}
            notes={notes}
          />
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Bookings</h2>
          {bookings.length === 0 ? (
            <p className="q-empty">No bookings yet.</p>
          ) : (
            <div className="q-stack">
              {bookings.map((b: any) => (
                <Link key={b.id} href={`/bookings/${b.id}`} className="q-tile q-row q-row-between q-plain-link">
                  <div>
                    <strong className="q-strong">{b.title}</strong>
                    <div className="q-meta">
                      {b.scheduledFor ? new Date(b.scheduledFor).toLocaleDateString() : 'Not scheduled'}
                    </div>
                  </div>
                  <div className="q-row">
                    <span className="q-num">{formatMoney(b.total, b.currency)}</span>
                    {b.stageName && <span className={`q-badge ${stageBadgeClass({ kind: b.stageKind, color: b.stageColor })}`}>{b.stageName}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

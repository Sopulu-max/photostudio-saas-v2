import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { AddLineForm } from './AddLineForm';
import { CreateContractButton, StartWorkButton, AddInvoiceForm } from './BookingActions';
import { SetClientForm } from './SetClientForm';
import { AddCrewForm, RemoveCrewButton } from './CrewForms';
import { listClients } from '@/modules/clients/interface';
import { listCrewForBooking, listAssignableEmployees, getWorkForLines } from '@/modules/production/interface';
import { TaskStatusControl } from './TaskStatusControl';
import { NewDeliveryForm, UploadFilesButton, RemoveFileButton, ShareControl } from './DeliveryForms';
import { ScheduleForm } from './ScheduleForm';
import { listDeliveriesForBooking } from '@/modules/delivery/interface';

export const dynamic = 'force-dynamic';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
function money(amount: number, currency = 'USD') {
  return `${CURRENCY_SYMBOL[currency] || ''}${Number(amount || 0).toLocaleString()} ${currency}`;
}
function linePrice(price: any) {
  const base = price?.base_price;
  if (base == null) return '—';
  return money(base, price?.currency || 'USD');
}

const STATUS_BADGE: Record<string, string> = { inquiry: 'q-badge-warning', active: 'q-badge-success', draft: 'q-badge-neutral', closed: 'q-badge-neutral', cancelled: 'q-badge-danger' };

export default async function BookingDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let orgId: string;
  let actorId: string | null = null;
  try {
    const auth = await getAuthOrgId();
    orgId = auth.orgId;
    actorId = auth.contactId;
  } catch {
    redirect('/login');
  }

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, title, status, scheduled_for, created_at,
      contact:contacts(id, display_name, email),
      booking_lines(id, title, price, service_id, status),
      contracts(id, version, status),
      financial_transactions(id, type, amount, currency, status)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!booking) notFound();

  const { data: services } = await supabaseAdmin
    .from('services')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('name');

  // Clients come through the Clients module's interface — composition, not a
  // reach into its tables.
  const clientRows = await listClients();
  const clientOptions = clientRows
    .map((c: any) => ({ contactId: c.contact?.id as string, name: c.contact?.display_name as string }))
    .filter((c: { contactId: string; name: string }) => !!c.contactId);

  // Crew, roster and work through Production's interface.
  const lineIds = (booking.booking_lines || []).map((l: any) => l.id);
  const [crew, candidates, work, deliveries] = await Promise.all([
    listCrewForBooking(booking.id),
    listAssignableEmployees(),
    getWorkForLines(lineIds),
    listDeliveriesForBooking(booking.id),
  ]);

  const lines: any[] = booking.booking_lines || [];
  const contracts: any[] = booking.contracts || [];
  const txns: any[] = booking.financial_transactions || [];

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="q-card" style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '1.05rem', marginTop: 0, marginBottom: '16px', fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/bookings" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>&larr; Back to Bookings</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="q-page-title" style={{ marginBottom: '4px' }}>{booking.title}</h1>
            <p className="q-page-subtitle" style={{ margin: 0 }}>
              {booking.contact?.display_name || 'No client yet'}
            </p>
          </div>
          <span className={`q-badge ${STATUS_BADGE[booking.status] || 'q-badge-neutral'}`}>{booking.status.toUpperCase()}</span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Client */}
        <Section title="Client">
          {booking.contact?.display_name ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '2px' }}>
                  {booking.contact?.display_name}
                </strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>
                  {booking.contact?.email || 'No contact details'}
                </span>
              </div>
              <SetClientForm bookingId={booking.id} clients={clientOptions} label="Change client…" />
            </div>
          ) : (
            <div>
              <div style={{ color: 'var(--q-color-ink-500)', marginBottom: '12px' }}>
                No client yet — a booking runs fine without one. Attach whoever this is for.
              </div>
              <SetClientForm bookingId={booking.id} clients={clientOptions} />
            </div>
          )}
        </Section>

        {/* When */}
        <Section title="When">
          <ScheduleForm bookingId={booking.id} scheduledFor={booking.scheduled_for} />
          {!booking.scheduled_for && (
            <p style={{ margin: '10px 0 0', fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>
              No date yet — set one and it appears on the calendar.
            </p>
          )}
        </Section>

        {/* Team on this booking */}
        <Section title="Team">
          {crew.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No one on this booking yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {crew.map((m: any) => (
                <div key={`${m.employeeId}-${m.role ?? ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 14px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong style={{ fontSize: '0.92rem' }}>{m.name}</strong>
                    {m.role && <span className="q-badge q-badge-neutral" style={{ marginLeft: '8px' }}>{m.role}</span>}
                    {!m.onBookingDirectly && (
                      <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--q-color-ink-500)' }}>via {m.via}</span>
                    )}
                  </div>
                  {m.onBookingDirectly && <RemoveCrewButton bookingId={booking.id} assignmentId={m.assignmentId} />}
                </div>
              ))}
            </div>
          )}
          <AddCrewForm bookingId={booking.id} candidates={candidates} />
        </Section>

        {/* Services (lines) */}
        <Section title="Services">
          {lines.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No services yet — add one, or leave it and fill in later.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lines.map((l) => {
                const w = work[l.id];
                return (
                  <div key={l.id} style={{ padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '2px' }}>{l.title}</strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>
                          {linePrice(l.price)}
                          {w && <> · {w.completed}/{w.total} done</>}
                        </span>
                      </div>
                      {!w && <StartWorkButton bookingId={booking.id} lineId={l.id} />}
                    </div>

                    {w && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                        {w.tasks.map((t: any) => (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                            <div style={{ fontSize: '0.88rem' }}>
                              {t.stageName}
                              {t.assignees.length > 0 && (
                                <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--q-color-ink-500)' }}>
                                  {t.assignees.map((a: any) => a.name).join(', ')}
                                </span>
                              )}
                            </div>
                            <TaskStatusControl taskId={t.id} status={t.status} orgId={orgId} actorId={actorId ?? ''} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <AddLineForm bookingId={booking.id} services={services || []} />
        </Section>

        {/* Contract */}
        <Section title="Contract">
          {contracts.length === 0 ? (
            <div>
              <div style={{ color: 'var(--q-color-ink-500)', marginBottom: '12px' }}>No contract yet — this booking runs fine without one. Add terms whenever you're ready.</div>
              <CreateContractButton bookingId={booking.id} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contracts.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div><strong>Contract v{c.version}</strong> <span className={`q-badge ${c.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`} style={{ marginLeft: '8px' }}>{c.status}</span></div>
                  <Link href={`/contracts/${c.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>Open</Link>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Delivery */}
        <Section title="Delivery">
          {deliveries.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>
              Nothing delivered yet. Bundle the finished work and share it when you're ready.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {deliveries.map((d: any) => (
                <div key={d.id} style={{ padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '2px' }}>{d.title}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>
                        {d.files.length} {d.files.length === 1 ? 'file' : 'files'}
                        {d.lastViewedAt && <> · viewed {new Date(d.lastViewedAt).toLocaleDateString()}</>}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`q-badge ${d.status === 'shared' ? 'q-badge-success' : 'q-badge-neutral'}`}>{d.status}</span>
                      <UploadFilesButton deliveryId={d.id} bookingId={booking.id} />
                    </div>
                  </div>

                  {d.files.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                      {d.files.map((f: any) => (
                        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.85rem' }}>{f.file_name}</span>
                          <RemoveFileButton fileId={f.id} bookingId={booking.id} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '12px' }}>
                    <ShareControl deliveryId={d.id} bookingId={booking.id} status={d.status} shareToken={d.shareToken} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <NewDeliveryForm bookingId={booking.id} />
        </Section>

        {/* Money */}
        <Section title="Invoices & Payments">
          {txns.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>No money on this booking yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {txns.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{String(t.type).replace(/_/g, ' ')}</strong>
                    <span className={`q-badge ${t.status === 'settled' ? 'q-badge-success' : 'q-badge-warning'}`} style={{ marginLeft: '8px' }}>{t.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontWeight: 600 }}>{money(t.amount, t.currency)}</span>
                    <Link href={`/finances/${t.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>Open</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          <AddInvoiceForm bookingId={booking.id} />
        </Section>

      </div>
    </div>
  );
}

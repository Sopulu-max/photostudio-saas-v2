import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { CreateContractButton, ExtractPackageButton } from './BookingActions';

import { listClients } from '@/modules/clients/interface';
import { TaskProgression } from './ProductionUI';
import { listEmployees, listRoles } from '@/modules/team/interface';

import { getBooking, getIntakeAnswersForBooking, suggestedDurationForBooking } from '@/modules/bookings/interface';
import { listPackages, formatDeliverable } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { StagePicker } from './BookingHeaderActions';
import { formatVariableValue } from '@/modules/services/interface';
import { stageBadgeClass } from '@/components/stageBadge';

import { NewDeliveryForm, UploadFilesButton, RemoveFileButton, ShareControl, DeliveryActions, FulfilsControl, CoverButton } from './DeliveryForms';
import { formatDuration } from '@/kernel/currency';
import { listDeliveriesForBooking, getFulfilmentForBooking } from '@/modules/delivery/interface';
import { formatMoney } from '@/kernel/currency';
import { GenerateInvoiceButton } from './InvoiceForms';
import { listInvoicesForBooking } from '@/modules/finances/interface';

export const dynamic = 'force-dynamic';

/** "₦200 × 3 hours = ₦600" when there's a unit; just the price when there isn't. */
function linePrice(price: any, quantity: number) {
  const base = price?.base_price;
  if (base == null) return '—';
  const currency = price?.currency || 'USD';
  const unit = price?.unit;
  const qty = Number(quantity ?? 1);
  if (qty === 1 && !unit) return formatMoney(base, currency);
  const unitLabel = unit ? `${qty} ${unit}${qty === 1 ? '' : 's'}` : `× ${qty}`;
  return `${formatMoney(base, currency)}${unit ? ' × ' : ' '}${unitLabel} = ${formatMoney(base * qty, currency)}`;
}

function lineTotal(l: any) {
  return Number(l.price?.base_price || 0) * Number(l.quantity ?? 1);
}


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

  const booking = await getBooking(params.id);
  if (!booking) notFound();

  // Get the org slug for public links
  const { data: orgData } = await supabaseAdmin.from('organizations').select('slug').eq('id', orgId).single();
  const orgSlug = orgData?.slug || '';

  // The catalogue of what can be added to this booking — asked of Packages,
  // never read from its table. Retired packages aren't offered for new lines.
  const packageRows = await listPackages();
  const packageOptions = (packageRows as any[])
    .filter((p) => p.status !== 'retired')
    .map((p) => ({ id: p.id as string, name: p.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const variantsByPackage: Record<string, any> = {};
  for (const p of packageRows as any[]) {
    if (p.status !== 'retired' && p.pricing_variant) variantsByPackage[p.id] = p.pricing_variant;
  }

  // Clients come through the Clients module's interface — composition, not a
  // reach into its tables.
  const clientRows = await listClients();
  // Archived clients aren't offered for a new assignment — same rule as retired services.
  const clientOptions = clientRows
    .filter((c: any) => c.status !== 'archived')
    .map((c: any) => ({ contactId: c.contact?.id as string, name: c.contact?.display_name as string }))
    .filter((c: { contactId: string; name: string }) => !!c.contactId);

  // Crew, roster and work through Production's interface.
  const lineIds = booking.lines.map((l: any) => l.id);

  // What each line is actually configured as — the package's scope plus
  // whatever the client answered. Keyed by line so it renders inline.
  const { getLineConfigurationForm, listStages } = await import('@/modules/bookings/interface');
  const configByLine: Record<string, any[]> = {};
  for (const id of lineIds) configByLine[id] = await getLineConfigurationForm(id);
  const [deliveries, stages, intake, suggestedMinutes, currencyCode, fulfilment, employees, roles] = await Promise.all([
    listDeliveriesForBooking(booking.id),
    listStages(),
    getIntakeAnswersForBooking(booking.id),
    suggestedDurationForBooking(booking.id),
    getStudioCurrency(),
    getFulfilmentForBooking(booking.id),
    listEmployees(),
    listRoles(),
  ]);

  // The documents raised against this booking, distinct from the money that
  // moved: an invoice is what was asked for, a transaction is what arrived.
  const invoices = await listInvoicesForBooking(booking.id);

  // What the packages promised, and what's still owed. Shared is the bar, not
  // uploaded: a bundle the client can't open isn't delivered.
  const promised = fulfilment.map((f) => ({ id: f.id, name: f.name }));
  const undelivered = fulfilment.filter((f) => !f.shared);

  // Anyone on this booking who isn't covering one of the roles the blueprints

  const lines: any[] = booking.lines;
  const contracts: any[] = booking.contracts;
  const txns: any[] = booking.transactions;

  // What's due to book, per the contract's own terms — suggested, never
  // forced. An operator can always raise something else instead. A booking
  // can have more than one contract once an earlier one is closed out, so
  // "latest" means most recently created, not just last in the array — and
  // an open one (still worth something) always wins over a closed one even
  // if it's older, since a cancelled contract's terms aren't live anymore.
  const byNewest = [...contracts].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  const hasOpenContract = contracts.some((c: any) => !['completed', 'cancelled'].includes(c.status));
  const latestContract = byNewest.find((c: any) => !['completed', 'cancelled'].includes(c.status)) || byNewest[0];
  const contractTerms: any = latestContract?.terms || {};
  const contractDepositPct = Number(contractTerms.deposit_percentage || 0);
  const contractBasePrice = Number(contractTerms.base_price || 0);

  // What's actually landed vs what's still owed. A refund (outbound) reduces
  // what counts as paid rather than being its own separate figure — it's
  // money that came back out, not a different kind of debt.
  const paidTotal = txns
    .filter((t) => t.status === 'settled')
    .reduce((sum, t) => sum + (t.direction === 'outbound' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0);
  const pendingTotal = txns.filter((t) => t.status === 'pending').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const outstanding = contractBasePrice > 0 ? Math.max(contractBasePrice - paidTotal, 0) : 0;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="q-card q-section">
      <h2 className="q-section-title">{title}</h2>
      {children}
    </div>
  );

  return (
    <div className="q-page-narrow">
      <Link href="/bookings" className="q-back">&larr; Back to Bookings</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{booking.title}</h1>
          <p className="q-page-subtitle">{booking.contact?.display_name || 'No client yet'}</p>
        </div>
        {/* The stage stays here: moving a booking along is the work, not an
            amendment to it. Editing the record is one click away. */}
        <div className="q-row">
          <span className={`q-badge ${stageBadgeClass(booking.stage)}`}>{booking.stage?.name}</span>
          <StagePicker bookingId={booking.id} stages={stages} currentStageId={booking.stage_id} />
          <Link href={`/bookings/${booking.id}/edit`} className="q-btn q-btn-secondary q-btn-sm">Edit</Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        {/* Client */}
        <Section title="Client">
          {booking.contact?.display_name ? (
            <div>
              <strong className="q-strong">{booking.contact?.display_name}</strong>
              <div className="q-meta">{booking.contact?.email || 'No contact details'}</div>
            </div>
          ) : (
            <p className="q-empty">
              No client yet — a booking runs fine without one.{' '}
              <Link href={`/bookings/${booking.id}/edit`} className="q-plain-link">Attach whoever this is for</Link>.
            </p>
          )}
        </Section>

        {/* What the client told us — answers to the service's intake questions */}
        {intake.length > 0 && (
          <Section title="What the client told us">
            <div className="q-stack q-stack-sm">
              {intake.map((row: any, i: number) => (
                <div key={i} className="q-tile q-row q-row-between">
                  <div>
                    <strong className="q-strong">{row.label}</strong>
                    {row.removed && <span className="q-meta-sm"> · no longer asked</span>}
                  </div>
                  <span className="q-meta-plain">{row.value}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* When */}
        <Section title="When">
          {booking.scheduled_for ? (
            <div>
              <strong className="q-strong">
                {new Date(booking.scheduled_for).toLocaleString(undefined, {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </strong>
              <div className="q-meta">
                {booking.duration_minutes
                  ? `${formatDuration(booking.duration_minutes)} · ends around ${new Date(
                      new Date(booking.scheduled_for).getTime() + booking.duration_minutes * 60000
                    ).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                  : 'No duration set'}
              </div>
            </div>
          ) : (
            <p className="q-empty">
              No date yet — <Link href={`/bookings/${booking.id}/edit`} className="q-plain-link">set one</Link> and it appears on the calendar.
              {suggestedMinutes ? ` What's booked suggests about ${formatDuration(suggestedMinutes)}.` : ''}
            </p>
          )}
        </Section>



        {/* What they're booking — one line per Package */}
        <Section title="What they're booking">
          {lines.length === 0 ? (
            <div>
              <p className="q-empty">
                Nothing on this booking yet —{' '}
                <Link href={`/bookings/${booking.id}/edit`} className="q-plain-link">add a package</Link>{' '}
                whenever you know what they want.
              </p>
              {booking.metadata?.form_responses?.dimensions && (
                <ExtractPackageButton bookingId={booking.id} />
              )}
            </div>
          ) : (
            <div className="q-stack">
              {lines.map((l) => {
                const pkg = (packageRows as any[]).find((p) => p.id === l.package_id);
                const svcNames = (pkg?.services || []).map((s: any) => s.name).filter(Boolean);
                
                // Classifications logic matching Packages
                const byDimension = new Map<string, { id: string; name: string; values: { id: string; name: string }[] }>();
                const absorb = (dims: any[]) => {
                  for (const d of (dims || [])) {
                    if (!byDimension.has(d.id)) byDimension.set(d.id, { id: d.id, name: d.name, values: [] });
                    const target = byDimension.get(d.id)!;
                    for (const v of d.values) if (!target.values.some((x: any) => x.id === v.id)) target.values.push(v);
                  }
                };
                if (pkg) {
                  absorb(pkg.dimensions);
                  (pkg.services || []).forEach((s: any) => absorb(s.dimensions));
                }
                const tags = [...byDimension.values()];
                
                const heldVars = (configByLine[l.id] || []).filter((f: any) => f.value != null);

                return (
                  <div key={l.id} className="q-card q-stack" style={{ padding: '20px' }}>
                    <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <strong className="q-strong" style={{ fontSize: '1.1rem' }}>{l.title}</strong>
                        <div className="q-meta q-num" style={{ marginTop: '4px' }}>
                          {linePrice(l.price, l.quantity)}
                        </div>
                      </div>
                    </div>

                    <div className="q-meta" style={{ marginTop: '12px' }}>
                      <strong className="q-strong" style={{ marginRight: '6px' }}>Services:</strong>
                      {svcNames.join(' + ') || 'None'}
                    </div>

                    {tags.length > 0 && (
                      <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {tags.map((d) => (
                          <div key={d.id} className="q-badge q-badge-neutral" style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', paddingRight: '6px' }}>
                            <span className="q-meta-plain" style={{ opacity: 0.7 }}>{d.name}:</span>
                            <span className="q-row" style={{ gap: '4px' }}>
                              {d.values.map((v, i) => (
                                <span key={v.id}>
                                  <Link href={`/services/classifications/${encodeURIComponent(v.id)}`} className="q-plain-link" style={{ color: 'inherit', textDecoration: 'none' }}>
                                    {v.name}
                                  </Link>
                                  {i < d.values.length - 1 ? <span style={{ opacity: 0.5 }}>, </span> : null}
                                </span>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {heldVars.length > 0 && (
                      <div className="q-meta" style={{ marginTop: '16px' }}>
                        <strong className="q-strong" style={{ marginRight: '4px' }}>Variables:</strong>
                        {heldVars.map((f: any) => `${f.label}: ${formatVariableValue({ value: f.value, unit: f.unit })}`).join(', ')}
                      </div>
                    )}

                    {pkg?.deliverables && pkg.deliverables.length > 0 && (
                      <div className="q-meta" style={{ marginTop: '8px' }}>
                        <strong className="q-strong" style={{ marginRight: '4px' }}>Deliverables:</strong>
                        {/* @ts-ignore */}
                        {pkg.deliverables.map((d: any) => formatDeliverable(d)).join(', ')}
                      </div>
                    )}

                    <TaskProgression
                      bookingId={booking.id}
                      lineId={l.id}
                      tasks={l.tasks || []}
                      employees={employees || []}
                      pkg={l.package}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {lines.length > 0 && (
            <div className="q-tile-sub q-row q-row-between">
              <span className="q-meta">Total</span>
              <strong className="q-stat-value">
                {formatMoney(lines.reduce((sum: number, l: any) => sum + lineTotal(l), 0), (lines[0]?.price as any)?.currency)}
              </strong>
            </div>
          )}
        </Section>

        {/* Deliverables */}
        <Section title="Deliverables">
          {/* What the packages promised, and whether it's been handed over. */}
          {fulfilment.length > 0 && (
            <div className="q-note q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
              <span className="q-meta-sm">
                {undelivered.length === 0
                  ? 'Everything promised has been shared.'
                  : `Still owed: ${undelivered.length} of ${fulfilment.length}`}
              </span>
              <div className="q-row" style={{ flexWrap: 'wrap' }}>
                {fulfilment.map((f) => (
                  <span key={f.id} className={`q-badge ${f.shared ? 'q-badge-success' : 'q-badge-neutral'}`}>
                    {f.name}
                    {f.shared
                      ? ' · shared'
                      : f.covered
                        ? ' · bundled, not shared'
                        : ' · outstanding'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {deliveries.length === 0 ? (
            <div className="q-muted">
              Nothing delivered yet. Bundle the finished work and share it when you're ready.
            </div>
          ) : (
            <div className="q-stack">
              {deliveries.filter((d: any) => !d.archivedAt).map((d: any) => (
                <div key={d.id} className="q-tile">
                  <div className="q-row q-row-between">
                    <div>
                      <strong className="q-strong">{d.title}</strong>
                      <div className="q-meta">
                        {d.files.length} {d.files.length === 1 ? 'file' : 'files'}
                        {d.lastViewedAt && <> · viewed {new Date(d.lastViewedAt).toLocaleDateString()}</>}
                      </div>
                    </div>
                    <div className="q-row">
                      <span className={`q-badge ${d.status === 'shared' ? 'q-badge-success' : 'q-badge-neutral'}`}>{d.status}</span>
                      <UploadFilesButton deliveryId={d.id} bookingId={booking.id} />
                    </div>
                  </div>

                  {d.files.length > 0 && (
                    <div className="q-stack q-stack-sm q-tile-sub">
                      {d.files.map((f: any) => (
                        <div key={f.id} className="q-row q-row-between">
                          <span className="q-meta">{f.file_name}</span>
                          <div className="q-row">
                            {(f.mime_type || '').startsWith('image/') && (
                              <CoverButton
                                deliveryId={d.id}
                                bookingId={booking.id}
                                deliveryAssetId={f.id}
                                isCover={d.coverAssetId === f.id}
                              />
                            )}
                            <RemoveFileButton fileId={f.id} bookingId={booking.id} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <FulfilsControl
                    deliveryId={d.id}
                    bookingId={booking.id}
                    promised={promised}
                    fulfils={d.fulfils}
                  />

                  <div className="q-row q-row-between" style={{ marginTop: '12px' }}>
                    <ShareControl deliveryId={d.id} bookingId={booking.id} status={d.status} shareToken={d.shareToken} />
                    <DeliveryActions deliveryId={d.id} bookingId={booking.id} title={d.title} status={d.status} archived={false} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <NewDeliveryForm bookingId={booking.id} />

          {deliveries.some((d: any) => d.archivedAt) && (
            <div style={{ marginTop: '28px' }}>
              <h3 className="q-section-title" style={{ fontSize: '0.95rem' }}>Archived</h3>
              <p className="q-meta" style={{ marginBottom: '12px' }}>
                Superseded, but not touched — a shared link here still works exactly as before.
              </p>
              <div className="q-stack">
                {deliveries.filter((d: any) => d.archivedAt).map((d: any) => (
                  <div key={d.id} className="q-tile" style={{ opacity: 0.7 }}>
                    <div className="q-row q-row-between">
                      <div>
                        <strong className="q-strong">{d.title}</strong>
                        <div className="q-meta">
                          {d.files.length} {d.files.length === 1 ? 'file' : 'files'}
                        </div>
                      </div>
                      <div className="q-row">
                        <span className={`q-badge ${d.status === 'shared' ? 'q-badge-success' : 'q-badge-neutral'}`}>{d.status}</span>
                        <DeliveryActions deliveryId={d.id} bookingId={booking.id} title={d.title} status={d.status} archived={true} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Money */}
        <Section title="Invoices & Payments">
          <div className="q-row q-row-between" style={{ marginBottom: '16px' }}>
            <span className="q-meta">
              {invoices.length === 0
                ? 'Nothing billed yet.'
                : `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'} raised.`}
            </span>
            <GenerateInvoiceButton bookingId={booking.id} hasLines={lines.length > 0} />
          </div>

          {invoices.length > 0 && (
            <div className="q-stack q-stack-sm" style={{ marginBottom: '18px' }}>
              {invoices.map((inv: any) => (
                <Link key={inv.id} href={`/finances/invoices/${inv.id}`} className="q-tile q-row q-row-between q-plain-link">
                  <div>
                    <strong className="q-strong">{inv.number || 'Draft invoice'}</strong>
                    <div className="q-meta-sm">
                      {inv.lines.length} {inv.lines.length === 1 ? 'line' : 'lines'}
                      {inv.issued_at ? ` · sent ${new Date(inv.issued_at).toLocaleDateString()}` : ' · not sent yet'}
                    </div>
                  </div>
                  <div className="q-row">
                    <span className="q-num q-strong">{formatMoney(inv.total, inv.currency || currencyCode)}</span>
                    <span className={`q-badge ${
                      inv.status === 'void' ? 'q-badge-danger'
                      : inv.settled ? 'q-badge-success'
                      : inv.status === 'draft' ? 'q-badge-neutral' : 'q-badge-warning'
                    }`}>
                      {inv.status === 'void' ? 'withdrawn'
                        : inv.settled ? 'paid'
                        : inv.partly ? `${formatMoney(inv.outstanding, inv.currency || currencyCode)} left`
                        : inv.status === 'draft' ? 'draft' : 'unpaid'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {contractBasePrice > 0 && (
            <div className="q-grid-3" style={{ marginBottom: '16px' }}>
              <div className="q-panel">
                <div className="q-stat-label">Paid</div>
                <div className="q-stat-value">{formatMoney(paidTotal, contractTerms.currency || currencyCode)}</div>
              </div>
              <div className="q-panel">
                <div className="q-stat-label">Outstanding</div>
                <div className="q-stat-value">{formatMoney(outstanding, contractTerms.currency || currencyCode)}</div>
              </div>
              {pendingTotal > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Pending</div>
                  <div className="q-stat-value q-warm">{formatMoney(pendingTotal, contractTerms.currency || currencyCode)}</div>
                </div>
              )}
            </div>
          )}
          {txns.length === 0 ? (
            <div className="q-muted">No money on this booking yet.</div>
          ) : (
            <div className="q-stack">
              {txns.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong className="q-cap">{String(t.type).replace(/_/g, ' ')}</strong>
                    <span className={`q-badge ${
                      t.status === 'settled' ? 'q-badge-success' :
                      t.status === 'pending' ? 'q-badge-warning' :
                      t.status === 'voided' ? 'q-badge-danger' : 'q-badge-neutral'
                    }`} style={{ marginLeft: '8px' }}>{t.status}</span>
                    {t.direction === 'outbound' && <span className="q-badge q-badge-neutral" style={{ marginLeft: '4px' }}>refund</span>}
                  </div>
                  <div className="q-row">
                    <span className="q-strong">{formatMoney(t.amount, t.currency)}</span>
                    <Link href={`/finances/${t.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }}>Open</Link>
                  </div>
                </div>
              ))}
            </div>
          )}

        </Section>

        {/* Contract */}
        <Section title="Contract">
          {contracts.length > 0 && (
            <div className="q-stack" style={{ marginBottom: hasOpenContract ? 0 : '12px' }}>
              {contracts.map((c) => (
                <div key={c.id} className="q-tile q-row q-row-between">
                  <div className="q-row">
                    <strong className="q-strong">Contract v{c.version}</strong>
                    <span className={`q-badge ${c.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{c.status}</span>
                  </div>
                  <Link href={`/contracts/${c.id}`} className="q-btn q-btn-secondary q-btn-sm">Open</Link>
                </div>
              ))}
            </div>
          )}
          {!hasOpenContract && (
            <div>
              <div className="q-muted">
                {contracts.length === 0
                  ? "No contract yet — this booking runs fine without one. Add terms whenever you're ready."
                  : 'Every contract on this booking is closed out — draft a new one whenever you need to.'}
              </div>
              <CreateContractButton bookingId={booking.id} label={contracts.length === 0 ? 'Create a contract' : 'Draft a new contract'} />
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}

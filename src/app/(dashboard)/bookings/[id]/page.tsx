import { notFound, redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { AddLineForm } from './AddLineForm';
import { CreateContractButton, StartWorkButton, AddInvoiceForm } from './BookingActions';
import { SetClientForm } from './SetClientForm';
import { AddCrewForm, RemoveCrewButton, FillRoleForm } from './CrewForms';
import { listClients } from '@/modules/clients/interface';
import { listCrewForBooking, listAssignableEmployees, getWorkForLines } from '@/modules/production/interface';
import { getBooking, listStages, getIntakeAnswersForBooking, suggestedDurationForBooking, getStaffingNeedsForBooking } from '@/modules/bookings/interface';
import { listPackages } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { StagePicker, BookingTitleActions } from './BookingHeaderActions';
import { LineActions } from './LineActions';
import { stageBadgeClass } from '@/components/stageBadge';
import { TaskStatusControl } from '@/components/TaskStatusControl';
import { TaskAssignControl } from '@/components/TaskAssignControl';
import { NewDeliveryForm, UploadFilesButton, RemoveFileButton, ShareControl, DeliveryActions } from './DeliveryForms';
import { ScheduleForm } from './ScheduleForm';
import { listDeliveriesForBooking } from '@/modules/delivery/interface';
import { formatMoney } from '@/kernel/currency';

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
  const [crew, candidates, work, deliveries, stages, intake, suggestedMinutes, currencyCode, staffing] = await Promise.all([
    listCrewForBooking(booking.id),
    listAssignableEmployees(),
    getWorkForLines(lineIds),
    listDeliveriesForBooking(booking.id),
    listStages(),
    getIntakeAnswersForBooking(booking.id),
    suggestedDurationForBooking(booking.id),
    getStudioCurrency(),
    getStaffingNeedsForBooking(booking.id),
  ]);

  // Anyone on the booking who isn't covering one of the roles the blueprints
  // asked for — a second shooter the studio added themselves, say.
  const neededRoleIds = new Set(staffing.roles.map((r) => r.roleId));
  const extraCrew = (crew as any[]).filter((m) => !m.roleId || !neededRoleIds.has(m.roleId));

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
  const suggestedInvoiceAmount = contractDepositPct > 0 ? (contractBasePrice * contractDepositPct) / 100 : undefined;
  const suggestedInvoiceLabel = contractDepositPct >= 100 ? 'Full payment' : `${contractDepositPct}% deposit`;

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
          <div style={{ marginTop: '10px' }}>
            <BookingTitleActions bookingId={booking.id} title={booking.title} />
          </div>
        </div>
        <div className="q-row">
          <span className={`q-badge ${stageBadgeClass(booking.stage)}`}>{booking.stage?.name}</span>
          <StagePicker bookingId={booking.id} stages={stages} currentStageId={booking.stage_id} />
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        {/* Client */}
        <Section title="Client">
          {booking.contact?.display_name ? (
            <div className="q-row q-row-between">
              <div>
                <strong className="q-strong">{booking.contact?.display_name}</strong>
                <div className="q-meta">{booking.contact?.email || 'No contact details'}</div>
              </div>
              <SetClientForm bookingId={booking.id} clients={clientOptions} label="Change client…" />
            </div>
          ) : (
            <div>
              <p className="q-empty" style={{ marginBottom: '12px' }}>
                No client yet — a booking runs fine without one. Attach whoever this is for.
              </p>
              <SetClientForm bookingId={booking.id} clients={clientOptions} />
            </div>
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
          <ScheduleForm
            bookingId={booking.id}
            scheduledFor={booking.scheduled_for}
            durationMinutes={booking.duration_minutes}
            suggestedMinutes={suggestedMinutes}
          />
          {!booking.scheduled_for && (
            <p className="q-meta" style={{ marginTop: '10px' }}>
              No date yet — set one and it appears on the calendar.
            </p>
          )}
        </Section>

        {/* Team — the roles come from what was booked, not from a blank roster */}
        <Section title="Team">
          {staffing.roles.length > 0 && (
            <>
              <p className="q-meta" style={{ marginBottom: '12px' }}>
                What these packages need, from their services&rsquo; blueprints. Unfilled is fine — it just means no one&rsquo;s named yet.
              </p>
              <div className="q-stack q-stack-sm">
                {staffing.roles.map((r) => (
                  <div key={r.roleId} className="q-tile">
                    <div className="q-row q-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                      <div className="q-row" style={{ flexWrap: 'wrap' }}>
                        <strong className="q-strong">{r.roleName}</strong>
                        <span className="q-meta-sm">
                          {r.stageCount} {r.stageCount === 1 ? 'stage' : 'stages'} · {r.fromPackages.join(', ')}
                        </span>
                      </div>
                      {r.assigned.length === 0
                        ? <span className="q-badge q-badge-warning">unfilled</span>
                        : <span className="q-badge q-badge-success">{r.assigned.length === 1 ? 'filled' : `${r.assigned.length} people`}</span>}
                    </div>

                    {r.assigned.length > 0 && (
                      <div className="q-row q-tile-sub" style={{ flexWrap: 'wrap' }}>
                        {r.assigned.map((a) => {
                          const member = (crew as any[]).find((m) => m.employeeId === a.employeeId && m.roleId === r.roleId);
                          return (
                            <span key={a.employeeId} className="q-row" style={{ gap: '6px' }}>
                              <span className="q-meta-plain">{a.name}</span>
                              {member?.onBookingDirectly && (
                                <RemoveCrewButton bookingId={booking.id} assignmentId={member.assignmentId} />
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="q-tile-sub">
                      <FillRoleForm bookingId={booking.id} roleId={r.roleId} roleName={r.roleName} candidates={candidates} />
                    </div>
                  </div>
                ))}
              </div>
              {staffing.unroutedStages > 0 && (
                <p className="q-meta-sm" style={{ marginTop: '10px' }}>
                  {staffing.unroutedStages} {staffing.unroutedStages === 1 ? 'stage' : 'stages'} on these packages
                  {staffing.unroutedStages === 1 ? " doesn't" : " don't"} name a role — route
                  {' '}<Link href="/services/settings" className="q-accent">their blueprints</Link> if you want them staffed too.
                </p>
              )}
            </>
          )}

          {staffing.roles.length === 0 && crew.length === 0 && (
            <p className="q-empty">
              {lines.length === 0
                ? 'No one on this booking yet — add a package and the roles its blueprints call for show up here.'
                : "No one yet, and these packages' blueprints don't name any roles."}
            </p>
          )}

          {extraCrew.length > 0 && (
            <div style={{ marginTop: staffing.roles.length > 0 ? '20px' : 0 }}>
              {staffing.roles.length > 0 && (
                <h3 className="q-section-title" style={{ fontSize: '0.95rem' }}>Also on this booking</h3>
              )}
              <div className="q-stack q-stack-sm">
                {extraCrew.map((m: any) => (
                  <div key={`${m.employeeId}-${m.roleId ?? ''}`} className="q-tile q-row q-row-between">
                    <div className="q-row">
                      <strong className="q-strong">{m.name}</strong>
                      {m.role && <span className="q-badge q-badge-neutral">{m.role}</span>}
                      {!m.onBookingDirectly && <span className="q-meta-sm">via {m.via}</span>}
                    </div>
                    {m.onBookingDirectly && <RemoveCrewButton bookingId={booking.id} assignmentId={m.assignmentId} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <AddCrewForm bookingId={booking.id} candidates={candidates} />
        </Section>

        {/* What they're booking — one line per Package */}
        <Section title="What they're booking">
          {lines.length === 0 ? (
            <p className="q-empty">Nothing on this booking yet — add a package whenever you know what they want.</p>
          ) : (
            <div className="q-stack">
              {lines.map((l) => {
                const w = work[l.id];
                return (
                  <div key={l.id} className="q-tile">
                    <div className="q-row q-row-between">
                      <div>
                        <strong className="q-strong">{l.title}</strong>
                        <div className="q-meta q-num">
                          {linePrice(l.price, l.quantity)}
                          {w && <> · {w.completed}/{w.total} done</>}
                        </div>
                      </div>
                      <div className="q-row">
                        {!w && <StartWorkButton bookingId={booking.id} lineId={l.id} />}
                        <LineActions
                          bookingId={booking.id}
                          lineId={l.id}
                          title={l.title}
                          basePrice={(l.price as any)?.base_price ?? null}
                          quantity={Number(l.quantity ?? 1)}
                          unit={(l.price as any)?.unit ?? null}
                          currency={(l.price as any)?.currency || 'USD'}
                          hasWork={!!w}
                        />
                      </div>
                    </div>

                    {w && (
                      <div className="q-stack q-stack-md q-tile-sub">
                        {w.tasks.map((t: any) => (
                          <div key={t.id}>
                            <div className="q-row q-row-between">
                              <span>
                                {t.stageName}
                                {t.isFrontStage === false && <span className="q-meta-sm"> · back-stage</span>}
                              </span>
                              <TaskStatusControl taskId={t.id} status={t.status} orgId={orgId} actorId={actorId ?? ''} />
                            </div>
                            <TaskAssignControl
                              taskId={t.id}
                              bookingId={booking.id}
                              assignees={t.assignees}
                              candidates={candidates}
                              dueDate={t.dueDate}
                              suggestedRoleId={t.suggestedRoleId}
                              suggestedRoleName={t.suggestedRoleName}
                            />
                          </div>
                        ))}
                      </div>
                    )}
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
          <AddLineForm bookingId={booking.id} packages={packageOptions} variantsByPackage={variantsByPackage} currencyCode={currencyCode} />
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

        {/* Delivery */}
        <Section title="Delivery">
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
                          <RemoveFileButton fileId={f.id} bookingId={booking.id} />
                        </div>
                      ))}
                    </div>
                  )}

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
          <AddInvoiceForm
            bookingId={booking.id}
            currencyCode={contractTerms.currency || currencyCode}
            suggestedLabel={suggestedInvoiceLabel}
            suggestedAmount={suggestedInvoiceAmount}
          />
        </Section>

      </div>
    </div>
  );
}

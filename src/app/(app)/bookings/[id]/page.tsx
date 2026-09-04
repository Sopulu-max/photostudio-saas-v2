import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { CreateContractButton, RestoreWorkButton } from './BookingActions';
import { EnquiryPanel } from './EnquiryPanel';

import { listClients } from '@/modules/clients/interface';
import { listEmployees, listRoles } from '@/modules/team/interface';
import { getBookingTeam, getBookingTasks } from '@/modules/production/interface';
import { BookingTasks } from './BookingTasks';
import { AddToTeam, RemoveFromTeam } from './TeamControls';

import { getBooking, getIntakeAnswersForBooking, getEnquiryForBooking, suggestedDurationForBooking } from '@/modules/bookings/interface';
import { listPackages, formatDeliverable } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { StagePicker } from './BookingHeaderActions';
import { formatVariableValue } from '@/modules/services/interface';
import { stageBadgeClass } from '@/components/stageBadge';

import { NewDeliveryForm, UploadFilesButton, RemoveFileButton, ShareControl, DeliveryActions, FulfilsControl, CoverButton } from './DeliveryForms';
import { formatDuration } from '@/kernel/currency';
import { listDeliveriesForBooking, getFulfilmentForBooking } from '@/modules/delivery/interface';
import { formatMoney } from '@/kernel/currency';
import { amountOf, firstPriced, hasPrice } from '@/kernel/money';
import { GenerateInvoiceButton } from './InvoiceForms';
import { listInvoicesForBooking, getBookingBilling } from '@/modules/finances/interface';
import { ShareBooking } from './ShareBooking';
import { NotesFor } from '@/components/NotesFor';
import { listNotesAbout } from '@/modules/notes/interface';

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

/*
 * What a line is worth, asked of the booking's own instance of the package.
 *
 * The line still carries a denormalised copy of the price, and this used to read
 * only that — so a price corrected on the booking showed here as whatever it had
 * been when the line was made. The instance is what the invoice and the contract
 * both bill from, so it is what this has to agree with.
 */
function priceOfLine(l: any) {
  return firstPriced(l.package?.price, l.price);
}

function lineTotal(l: any) {
  return amountOf(priceOfLine(l)) * Number(l.quantity ?? 1);
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
  const [deliveries, stages, intake, enquiry, suggestedMinutes, currencyCode, fulfilment, team, bookingTasks, employees, roles] = await Promise.all([
    listDeliveriesForBooking(booking.id),
    listStages(),
    getIntakeAnswersForBooking(booking.id),
    getEnquiryForBooking(booking.id),
    suggestedDurationForBooking(booking.id),
    getStudioCurrency(),
    getFulfilmentForBooking(booking.id),
    getBookingTeam(booking.id),
    getBookingTasks(booking.id),
    listEmployees(),
    listRoles(),
  ]);

  // The documents raised against this booking, distinct from the money that
  // moved: an invoice is what was asked for, a transaction is what arrived.
  const invoices = await listInvoicesForBooking(booking.id);
  // Booked, invoiced and paid — three different questions, asked of Finances
  // rather than worked out again here from its tables.
  const billing = await getBookingBilling(booking.id);
  const notes = await listNotesAbout({ type: 'booking', id: booking.id });

  // What the packages promised, and what's still owed. Shared is the bar, not
  // uploaded: a bundle the client can't open isn't delivered.
  const promised = fulfilment.map((f) => ({ id: f.id, name: f.name }));
  const undelivered = fulfilment.filter((f) => !f.shared);

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
  /*
   * What this booking is worth, contract or no contract.
   *
   * The figures used to come only from the contract's snapshotted terms, so a
   * studio that had not sent one — or does not send them at all — saw no totals
   * beside its invoices, however much had been billed and paid. A booking is
   * worth what its packages come to; a signed contract fixes that number, it
   * does not create it.
   */
  const bookedTotal = lines.reduce((sum: number, l: any) => sum + lineTotal(l), 0);
  const bookingValue = contractBasePrice > 0 ? contractBasePrice : bookedTotal;
  // Same reasoning for the currency: the contract's if there is one, otherwise
  // whatever the packages are priced in, and the studio's own as a last resort.
  const moneyCurrency = contractTerms.currency
    || (lines.map((l: any) => priceOfLine(l) as any).find((p: any) => p?.currency)?.currency)
    || currencyCode;
  /*
   * Two different remainders, which used to be one.
   *
   * "Outstanding" was booked minus paid, which answers neither question well: it
   * counts work nobody has been billed for as though the client owed it, and it
   * ignores an invoice sitting unpaid on their desk. A contract, where one
   * exists, fixes what is owed overall; what has been billed and paid comes from
   * the invoices themselves.
   */
  /*
   * A CONCESSION IS NOT A REMAINDER, ON EITHER BRANCH.
   *
   * This subtracted only what had been billed, so a discount reappeared as work
   * still to do: 250,000 agreed, 225,000 invoiced after ten per cent off, and
   * the page announcing "₦25,000 left to invoice" — in the section summary, in
   * a panel of its own, and forcing the section open as though somebody had
   * forgotten to bill it. Nobody had. The studio gave it away.
   *
   * getBookingBilling counts it now, and the contract branch has to as well, or
   * the bug survives on exactly the bookings formal enough to have a contract.
   */
  const leftToInvoice = contractBasePrice > 0
    ? Math.max(contractBasePrice - billing.invoiced - billing.discounted, 0)
    : billing.leftToInvoice;
  const leftToPay = billing.leftToPay;

  const Section = ({ title, children }: {
    title: string;
    children: React.ReactNode;
  }) => (
    /*
     * q-rise staggers by nth-child, so sections come in down the page in the
     * order they are read — client, date, packages, team, tasks, deliverables,
     * invoices, contract. One class on the shared Section so every one of them
     * obeys it and no future section can forget to.
     */
    <div className="q-card q-section q-rise">
      <h2 className="q-section-title">{title}</h2>
      {children}
    </div>
  );


  return (
    <div className="q-page-narrow">
      <Link href="/bookings" className="q-back">&larr; Back to Bookings</Link>

      {/*
        * The work, before the words about it — and present either way.
        *
        * Drawn only when a cover exists, this page would give no sign that a
        * booking could have one, so the only way to find out would be to open
        * the editor. Empty it is the same wash the card uses, and it says what
        * it is for. The whole band is the link to the editor.
        */}
      <Link
        href={`/bookings/${booking.id}/edit`}
        className={(booking as any).cover_url ? 'q-cover-banner q-plain-link' : 'q-cover-banner q-cover-empty q-plain-link'}
        style={(booking as any).cover_url
          ? {
              backgroundImage: `url(${(booking as any).cover_url})`,
              backgroundPosition: (booking as any).cover_position || undefined,
            }
          : undefined}
        title={(booking as any).cover_url ? 'Change the cover' : 'Add a cover'}
      >
        {!(booking as any).cover_url && <span className="q-meta-sm">Add a cover</span>}
      </Link>

      <header className="q-page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="q-row" style={{ alignItems: 'center', gap: '12px' }}>
            <h1 className="q-page-title">{booking.title}</h1>
            {/* The stage badge belongs next to the title — it is the booking's
                current identity, not an action button. The picker to change it
                stays on the right where the controls live. */}
            {booking.stage?.name && (
              <span className={`q-badge ${stageBadgeClass(booking.stage)}`}>{booking.stage.name}</span>
            )}
          </div>
          <p className="q-page-subtitle" style={{ marginTop: '4px' }}>
            {booking.contact?.display_name || 'No client yet'}
          </p>
        </div>
        <div className="q-row">
          <StagePicker bookingId={booking.id} stages={stages} currentStageId={booking.stage_id} />
          <Link href={`/bookings/${booking.id}/edit`} className="q-btn q-btn-secondary">Edit</Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        {/*
          * What the client asked for, before the studio answered it.
          *
          * First on the page, and open, because on a booking that is still only
          * an enquiry this is frequently the only thing that says what it is
          * for — everything below it is structure that may not be filled in
          * yet. Shown exactly as typed; it is a person's sentence, not a field.
          */}
        {booking.brief && (
          <Section title="What they asked for">
            <p className="q-text-body q-prewrap">{booking.brief}</p>
          </Section>
        )}

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

        {/* What the client filled in. Named after the form it came from, so the
            thing a studio builds and the thing it reads back carry one name. */}
        {intake.length > 0 && (
          <Section title="Booking form answers">
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
        <Section title="Date and time">
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
        <Section title="Packages">
          {lines.length === 0 ? (
            <div className="q-stack q-stack-sm">
              <p className="q-empty">
                Nothing on this booking yet —{' '}
                <Link href={`/bookings/${booking.id}/edit`} className="q-plain-link">add a package</Link>{' '}
                whenever you know what they want.
              </p>
              {enquiry && <EnquiryPanel bookingId={booking.id} enquiry={enquiry} />}
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

                  </div>
                );
              })}
            </div>
          )}
          {/*
            * NO TASK LIST HERE, DELIBERATELY. The work is in the Tasks section
            * below, as one list, with the package each step came from shown
            * against it.
            *
            * It was in both. BookingTasks was written to replace the per-package
            * lists — its own note says a booking with three packages showed
            * three separate lists and no view of the job as one thing — and
            * then the per-package list was never taken out. So every task a
            * package brought was drawn twice on this page, in two different
            * shapes, each with its own assign control writing to the same row.
            *
            * The unified list is a strict superset: getBookingTasks selects
            * every booking_task with no line filter, and BookingTasks can also
            * set a role, add a step and remove one, and narrows the assignee
            * list to people who actually hold the role. Nothing was lost here.
            */}
          {lines.length > 0 && (
            <div className="q-tile-sub q-row q-row-between">
              <span className="q-meta">Total</span>
              <strong className="q-stat-value">
                {formatMoney(lines.reduce((sum: number, l: any) => sum + lineTotal(l), 0), (lines[0]?.price as any)?.currency)}
              </strong>
            </div>
          )}
        </Section>

        {/*
          * Who is on this booking — read off the tasks, not recorded separately.
          * Grouped by role because that is the question actually asked before a
          * shoot ("have I got a second shooter for Saturday"), and because a
          * role nobody is covering has to be visible, which a list of names
          * cannot show.
          */}
        <Section title="Team">
          {team.roles.length === 0 ? (
            <p className="q-meta" style={{ marginBottom: '16px' }}>
              No team members assigned.
            </p>
          ) : (
            <>
              {team.unfilled > 0 && (
                <p className="q-meta" style={{ marginBottom: '16px' }}>
                  {team.unfilled} {team.unfilled === 1 ? 'task is' : 'tasks are'} unassigned.
                </p>
              )}
              <div className="q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
                {team.roles.map((r: any) => (
                  <div key={r.roleId ?? 'none'} className="q-row q-row-between" style={{ alignItems: 'center' }}>
                    <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="q-strong">{r.roleName}</span>
                      {r.tasks.length > 0 && (
                        <span className="q-meta-sm">
                          {r.tasks.length} {r.tasks.length === 1 ? 'task' : 'tasks'}
                        </span>
                      )}
                    </span>
                    <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {r.covering.map((p: any) => {
                        const member = r.members.find((m: any) => m.person.id === p.id);
                        return (
                          <span key={p.id} className="q-badge q-badge-neutral q-row" style={{ gap: '4px', alignItems: 'center' }}>
                            {p.name}
                            {/* Only someone put on directly can be taken off here;
                                a person who is only on a task comes off by
                                unassigning that task. */}
                            {member && (
                              <RemoveFromTeam
                                bookingId={booking.id}
                                assignmentId={member.assignmentId}
                                name={p.name}
                              />
                            )}
                          </span>
                        );
                      })}
                      {r.covering.length === 0 && <span className="q-meta-sm">Unassigned</span>}
                      {r.unassigned > 0 && r.covering.length > 0 && (
                        <span className="q-meta-sm">{r.unassigned} task{r.unassigned === 1 ? '' : 's'} unassigned</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <AddToTeam
            bookingId={booking.id}
            employees={employees as any}
            roles={(roles as any[]).map((r) => ({ id: r.id, name: r.name }))}
          />

          {team.hasTasks && (
            <p className="q-meta-sm" style={{ marginTop: '16px' }}>
              Individual tasks can be assigned under Tasks below.
            </p>
          )}
        </Section>

        {/*
          * The work, collated across every package on this booking.
          *
          * It used to live under each package, so a booking with three packages
          * had three separate lists and no view of the job as one thing. The
          * package a task came from is still shown against it; it just no
          * longer decides how the list is organised.
          */}
        <Section title="Tasks">
          {/*
            * A booking whose packages call for work but whose board is empty.
            *
            * It happens two ways, neither of which shows as an error: a booking
            * taken before the studio wrote its workflow (syncing a workflow
            * reaches the packages built from it and stops there), and — until
            * this was fixed — every booking taken through the public link. The
            * work is copied from the package when a line is added, and that was
            * the only moment it ever happened, so there was no way back.
            */}
          {bookingTasks.length === 0 && lines.some((l: any) => l.package_id) && (
            <div className="q-note q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
              <span className="q-meta-sm">
                Nothing is on this board, though what was booked calls for work.
                That happens to bookings taken before the workflow was written.
              </span>
              <RestoreWorkButton bookingId={booking.id} />
            </div>
          )}
          <BookingTasks
            bookingId={booking.id}
            tasks={bookingTasks as any}
            employees={employees as any}
            roles={(roles as any[]).map((r) => ({ id: r.id, name: r.name }))}
          />
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
                ? billing.booked > 0
                  ? `Nothing billed yet. ${formatMoney(billing.booked, moneyCurrency)} to invoice.`
                  : 'Nothing billed yet — put a price on the packages and this can be invoiced.'
                : leftToInvoice > 0
                  ? `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'} raised · ${formatMoney(leftToInvoice, moneyCurrency)} still to invoice.`
                  : `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'} raised · fully invoiced.`}
            </span>
            {/* Having lines was the old test, and it offered the button for a
                booking nobody had quoted — which then raised an invoice for
                nothing. What makes a booking billable is a price on it. */}
            <GenerateInvoiceButton bookingId={booking.id} canBill={lines.some((l) => hasPrice(priceOfLine(l)))} />
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

          {bookingValue > 0 && (
            <div className="q-grid-3" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
              <div className="q-panel">
                <div className="q-stat-label">{contractBasePrice > 0 ? 'Agreed' : 'Booked'}</div>
                <div className="q-stat-value">{formatMoney(bookingValue, moneyCurrency)}</div>
              </div>
              <div className="q-panel">
                <div className="q-stat-label">Invoiced</div>
                <div className="q-stat-value">{formatMoney(billing.invoiced, moneyCurrency)}</div>
              </div>
              {/*
                * THE GAP BETWEEN AGREED AND INVOICED, NAMED.
                *
                * Two figures that do not add up, side by side, with nothing
                * saying why. The discount was recorded on the invoice, worked
                * out correctly and frozen there — and then never mentioned
                * again on the page where the operator actually looks. What was
                * given away is a decision somebody made, and it belongs on the
                * record beside the numbers it explains.
                */}
              {billing.discounted > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Discounted</div>
                  <div className="q-stat-value">{formatMoney(billing.discounted, moneyCurrency)}</div>
                </div>
              )}
              <div className="q-panel">
                <div className="q-stat-label">Paid</div>
                <div className="q-stat-value">{formatMoney(billing.paid, moneyCurrency)}</div>
              </div>
              {leftToInvoice > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Left to invoice</div>
                  <div className="q-stat-value">{formatMoney(leftToInvoice, moneyCurrency)}</div>
                </div>
              )}
              {leftToPay > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Left to pay</div>
                  <div className="q-stat-value">{formatMoney(leftToPay, moneyCurrency)}</div>
                </div>
              )}
              {pendingTotal > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Pending</div>
                  <div className="q-stat-value q-warm">{formatMoney(pendingTotal, moneyCurrency)}</div>
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

        {/*
          * THE CLIENT'S OWN COPY.
          *
          * Last, because it is about the whole booking rather than a part of
          * it — everything above is what the link would show.
          */}
        {/*
          * WHAT THE STUDIO HAS WRITTEN DOWN ABOUT THIS JOB.
          *
          * Distinct from the brief above, which is the client's own words and
          * is never edited. This is the studio's side: the gate code, that they
          * moved the date twice, what to remember for the next one.
          *
          * The same notes the notes app holds — one table, one module. A note
          * taken off this booking goes there rather than being destroyed.
          */}
        <Section title="Notes">
          <NotesFor
            about={{ type: 'booking', id: booking.id }}
            aboutLabel="this booking"
            notes={notes}
          />
        </Section>

        <Section title="Client confirmation">
          <ShareBooking
            bookingId={booking.id}
            bookingTitle={booking.title}
            shareToken={(booking as any).share_token ?? null}
            sharedAt={(booking as any).shared_at ?? null}
            hasClient={Boolean(booking.contact?.id)}
          />
        </Section>

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
          {!hasOpenContract && (() => {
            // A contract states a scope and a price, so it is only offered once
            // the booking can supply both. Offering it earlier meant clicking it
            // and being told no — or worse, before the domain refused, getting an
            // agreement to do nothing for nothing.
            const blocker = !booking.contact?.id
              ? 'Add a client to this booking and a contract can be drafted from it.'
              : lines.length === 0
                ? 'Add a package and a contract can be drafted from what was agreed.'
                : !lines.every((l: any) => hasPrice(priceOfLine(l)))
                  ? 'Price every package on this booking and a contract can be drafted from it.'
                  : null;
            return (
              <div>
                <div className="q-muted">
                  {contracts.length === 0
                    ? "No contract yet — this booking runs fine without one. Add terms whenever you're ready."
                    : 'Every contract on this booking is closed out — draft a new one whenever you need to.'}
                </div>
                {blocker
                  ? <div className="q-meta-sm">{blocker}</div>
                  : <CreateContractButton bookingId={booking.id} label={contracts.length === 0 ? 'Create a contract' : 'Draft a new contract'} />}
              </div>
            );
          })()}
        </Section>

      </div>
    </div>
  );
}

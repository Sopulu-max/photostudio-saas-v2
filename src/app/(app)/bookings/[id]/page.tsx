import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { PrintHead, PrintFacts } from '@/components/Print';
import { CreateContractButton } from './BookingActions';
import { ResolveEnquiry } from './ResolveEnquiry';
import { WorkPositions } from '@/components/WorkPositions';
import { BookingTasks } from './BookingTasks';
import { AddToTeam, RemoveFromTeam } from './TeamControls';
import { readBookingPage } from '@/modules/bookings/interface';
import { StagePicker } from './BookingHeaderActions';
import { LineExtras } from './LineExtras';
import { formatVariableValue } from '@/modules/services/interface';
import { stageBadgeClass } from '@/components/stageBadge';
import { NewDeliveryForm, UploadFilesButton, RemoveFileButton, ShareControl, DeliveryActions, FulfilsControl, CoverButton } from './DeliveryForms';
import { formatDuration, formatMoney } from '@/kernel/currency';
import { GenerateInvoiceButton } from './InvoiceForms';
import { ShareBooking } from './ShareBooking';
import { NotesFor } from '@/components/NotesFor';

export const dynamic = 'force-dynamic';

/** "₦200 × 3 hours = ₦600" when there's a unit; just the price when there isn't. */
function linePrice(price: { base: number | null; currency: string; unit: string | null; quantity: number }) {
  if (price.base == null) return '—';
  const qty = price.quantity;
  if (qty === 1 && !price.unit) return formatMoney(price.base, price.currency);
  const unitLabel = price.unit ? `${qty} ${price.unit}${qty === 1 ? '' : 's'}` : `× ${qty}`;
  return `${formatMoney(price.base, price.currency)}${price.unit ? ' × ' : ' '}${unitLabel} = ${formatMoney(price.base * qty, price.currency)}`;
}

/**
 * THE PAGE DRAWS WHAT IT IS GIVEN. Every fact about the booking - what a
 * line is called and worth, its classification and answers, which figure
 * is agreed and which booked, whether it can be invoiced or a contract
 * drafted - arrives in one typed read from Bookings (readBookingPage) with
 * the derivations done. Nothing here works a fact out for itself; a page
 * that did was a second reading, and second readings drift.
 */
export default async function BookingDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const page = await readBookingPage(params.id);
  if (!page) notFound();
  const { head, lines, money, work, deliverables, contract } = page;
  const bookingId = page.id;

  const Section = ({ title, id, children }: {
    title: string;
    /** An anchor, so the edit page's "what follows" can point at it. */
    id?: string;
    children: React.ReactNode;
  }) => (
    /*
     * q-rise staggers by nth-child, so sections come in down the page in the
     * order they are read — client, date, packages, team, tasks, deliverables,
     * invoices, contract. One class on the shared Section so every one of them
     * obeys it and no future section can forget to.
     */
    <div className="q-card q-section q-rise" id={id}>
      <h2 className="q-section-title">{title}</h2>
      {children}
    </div>
  );


  return (
    <div className="q-print-page">
      <Link href="/bookings" className="q-back">&larr; Back to Bookings</Link>

      {/* No cover band, for now: the print opens on its head. The booking's
          pictures still lead its row on the sheet. */}
      {/*
        * THE PRINT'S HEAD.                                       (D1, D2, D4)
        *
        * This was a page header - the title, the stage, the client's name as
        * a subtitle - followed by a card called Client, a card called Date and
        * time, and a card holding what the client asked for. Three boxes for
        * three facts, each with its own heading, before the packages.
        *
        * A booking is one job, and this page is its print: the photograph
        * above, what is on it as a stamp, the name at the size of a name, and
        * the facts on hairlines - who, when, what, and what is owed. Their
        * words follow as the description does under a package, because that
        * is what they are: the client's own sentence, not a field. The Client
        * and Date cards were those facts and nothing else; they are lines now.
        *
        * The stage stays as a badge beside the name: it is the studio's own
        * vocabulary for where a job has got to, and it is one of the few
        * things here that is genuinely a status.
        */}
      {(() => {
        const when = head.when.at ? new Date(head.when.at) : null;
        const whenSaid = when
          ? when.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
          : null;
        const endsSaid = when && head.when.durationMinutes
          ? new Date(when.getTime() + head.when.durationMinutes * 60000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
          : null;
        const packageNames = lines.map((l) => l.name);

        return (
          <>
            <PrintHead
              stamp={head.stamp ?? 'No package yet'}
              name={head.title}
              badge={head.stage
                ? <span className={`q-badge ${stageBadgeClass(head.stage as any)}`}>{head.stage.name}</span>
                : undefined}
              actions={<>
                <StagePicker
                  bookingId={bookingId}
                  stages={head.stages}
                  currentStageId={head.stage?.id ?? ''}
                  /* Every task done: the completed stage has become available.
                     Said, not done - a stage is the studio's decision. */
                  workDone={head.workDone}
                />
                <Link href={`/bookings/${bookingId}/edit`} className="q-btn q-btn-secondary">Edit</Link>
              </>}
            />

            <PrintFacts facts={[
              {
                key: 'Client',
                value: head.client?.name ?? null,
                more: head.client?.email ? `· ${head.client.email}` : undefined,
                absent: <>No client yet — <Link href={`/bookings/${bookingId}/edit`} className="q-plain-link">attach whoever this is for</Link></>,
              },
              {
                key: 'When',
                value: whenSaid,
                more: whenSaid && head.when.durationMinutes
                  ? `${formatDuration(head.when.durationMinutes)}${endsSaid ? ` · ends ${endsSaid}` : ''}`
                  : undefined,
                absent: <>
                  No date yet — <Link href={`/bookings/${bookingId}/edit`} className="q-plain-link">set one</Link> and it appears on the calendar.
                  {head.when.suggestedMinutes ? ` What is booked suggests about ${formatDuration(head.when.suggestedMinutes)}.` : ''}
                </>,
              },
              {
                key: 'Packages',
                value: packageNames.length > 0 ? packageNames.join(' · ') : null,
                absent: 'Nothing on this booking yet',
              },
              /* The one amber figure on the page (D3): what still needs the
                 studio. Nothing owed is said in ink, quietly. */
              {
                key: 'Owed',
                figure: head.owed ? { text: formatMoney(head.owed.amount, head.owed.currency), due: true } : undefined,
                absent: 'Nothing owed',
              },
            ]} />

            {/*
              * What the client asked for, in their words, under the facts -
              * the way a description sits under a package. Shown exactly as
              * typed: it is a person's sentence, and on an enquiry it is often
              * the only thing that says what the job is for.
              */}
            {head.brief && (
              <p className="q-text-body q-prewrap q-print-brief">{head.brief}</p>
            )}
          </>
        );
      })()}

      <div className="q-stack q-stack-lg">

        {/* What the client filled in. Named after the form it came from, so the
            thing a studio builds and the thing it reads back carry one name. */}
        {/* What the studio understands this booking to be for - its own reading,
            as opposed to what a package narrows to, which is read per package
            below. Shown when there is one: a booking nothing classifies has no
            absence to state here, because nothing asked it. */}
        {page.classifications.length > 0 && (
          <Section title="Classifications">
            <div className="q-stack q-stack-sm">
              {page.classifications.map((c) => (
                <div key={c.dimensionId + c.valueId} className="q-tile q-row q-row-between">
                  <strong className="q-strong">{c.dimensionName}</strong>
                  <span className="q-meta-plain">{c.valueName}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {page.formAnswers.length > 0 && (
          <Section title="Booking form answers">
            <div className="q-stack q-stack-sm">
              {page.formAnswers.map((row: any, i: number) => (
                <div key={i} className="q-tile q-row q-row-between">
                  <div>
                    <strong className="q-strong">{row.label}</strong>
                    {row.removed && <span className="q-meta-sm"> · no longer asked</span>}
                  </div>
                  {/* A file the client sent opens as itself — the picture to
                      be printed is read as a picture, not as its file name. */}
                  {row.attachment ? (
                    <a href={row.attachment.url} target="_blank" rel="noopener noreferrer" className="q-file q-file-has" style={{ padding: '8px 12px' }}>
                      {row.attachment.image
                        ? <img className="q-file-thumb" src={row.attachment.url} alt={row.value} />
                        : <span className="q-file-thumb" aria-hidden="true" />}
                      <span className="q-file-body">
                        <span className="q-file-name">{row.value}</span>
                        <span className="q-file-hint">Open</span>
                      </span>
                    </a>
                  ) : (
                    <span className="q-meta-plain">{row.value}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/*
          * ONE COLUMN, IN THE ORDER A JOB IS READ.
          *
          * This is a print: the photograph, the facts, then the document down
          * the page at its measure. A two-column grid was tried here - packages
          * and work on the left, money, people and papers on the right - and it
          * cut a 1080px print into two 500px columns, wrapped every task row
          * into three lines, and split the work from the crew doing it. The
          * order below is the reading: what was sold, what it owes, the work,
          * the money, the papers, the notes.
          */}
          <Section title="Packages">
          {lines.length === 0 ? (
            <div className="q-stack q-stack-sm">
              <p className="q-empty">
                Nothing on this booking yet —{' '}
                <Link href={`/bookings/${bookingId}/edit`} className="q-plain-link">add a package</Link>{' '}
                whenever you know what they want.
              </p>
            </div>
          ) : (
            <div className="q-stack">
              {lines.map((l) => (
                <div key={l.id} className="q-card q-stack" style={{ padding: '20px' }}>
                  <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <strong className="q-strong" style={{ fontSize: '1.1rem' }}>{l.name}</strong>
                      <div className="q-meta q-num" style={{ marginTop: '4px' }}>{linePrice(l.price)}</div>
                    </div>
                  </div>

                  <div className="q-stack q-stack-md" style={{ marginTop: '16px' }}>
                    {(l.services.length > 0 || l.classification.length > 0) && (
                      <div className="q-stack q-stack-sm">
                        <strong className="q-meta">Services & Scope</strong>
                        {l.services.length > 0 && <div className="q-text-body">{l.services.join(' + ')}</div>}
                        {l.classification.length > 0 && (
                          <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                            {l.classification.map((d) => (
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
                      </div>
                    )}

                    {l.configuration.length > 0 && (
                      <div className="q-stack q-stack-sm" style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '16px' }}>
                        <strong className="q-meta">Configuration</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', alignItems: 'baseline' }}>
                          {l.configuration.map((f) => (
                            <React.Fragment key={f.key}>
                              <div className="q-meta-plain" style={{ opacity: 0.7 }}>{f.label}</div>
                              <div className="q-text-body">
                                {f.value == null
                                  ? <Link href={`/bookings/${bookingId}/edit`} className="q-absent q-plain-link">Not answered yet</Link>
                                  : f.kind
                                    ? formatVariableValue({ value: f.value, unit: f.unit, kind: f.kind })
                                    : String(f.value)}
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}

                    {l.promises.length > 0 && (
                      <div className="q-stack q-stack-sm" style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '16px' }}>
                        <strong className="q-meta">Deliverables</strong>
                        <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--q-color-ink-900)' }}>
                          {l.promises.map((d, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* More of what this package promises - the only thing an
                      extra is. Each promise knows the service that makes it,
                      whose rate suggests the figure. */}
                  {l.extras && (
                    <LineExtras
                      lineId={l.id}
                      currencyCode={money.currency}
                      promises={l.extras.promises}
                      taken={l.extras.taken}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {/*
            * What the client described, kept in view whether or not anything
            * has been put on the booking yet. It used to vanish the moment a
            * line existed, taking the rest of their request with it.
            */}
          {/* Only while something they asked for is not answered by a
              package on the booking - the set test, not lines.length. */}
          {page.request.enquiry && !page.request.covered && (
            <div style={{ marginTop: lines.length > 0 ? '16px' : 0 }}>
              <ResolveEnquiry
                bookingId={bookingId}
                chosen={page.request.enquiry.chosen}
                message={page.request.enquiry.message}
                offers={page.request.enquiry.offers}
                capabilities={page.request.enquiry.capabilities}
                currencyCode={money.currency}
                alreadyOn={lines.length > 0}
              />
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

          {page.total && (
            <div className="q-tile-sub q-row q-row-between" style={{ marginTop: '16px' }}>
              <span className="q-meta">Total</span>
              <strong className="q-stat-value">{formatMoney(page.total.amount, page.total.currency)}</strong>
            </div>
          )}
        </Section>
          <Section title="Deliverables">
          {/* What the packages promised, and whether it's been handed over. */}
          {deliverables.fulfilment.length > 0 && (
            <div className="q-note q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
              <span className="q-meta-sm">
                {deliverables.undelivered === 0
                  ? 'Everything promised has been shared.'
                  : `Still owed: ${deliverables.undelivered} of ${deliverables.fulfilment.length}`}
              </span>
              <div className="q-row" style={{ flexWrap: 'wrap' }}>
                {deliverables.fulfilment.map((f: any) => (
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

          {deliverables.deliveries.length === 0 ? (
            <div className="q-muted">
              Nothing delivered yet. Bundle the finished work and share it when you're ready.
            </div>
          ) : (
            <div className="q-stack">
              {deliverables.deliveries.filter((d: any) => !d.archivedAt).map((d: any) => (
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
                      <UploadFilesButton deliveryId={d.id} bookingId={bookingId} />
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
                                bookingId={bookingId}
                                deliveryAssetId={f.id}
                                isCover={d.coverAssetId === f.id}
                              />
                            )}
                            <RemoveFileButton fileId={f.id} bookingId={bookingId} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <FulfilsControl
                    deliveryId={d.id}
                    bookingId={bookingId}
                    promised={deliverables.promised}
                    fulfils={d.fulfils}
                  />

                  <div className="q-row q-row-between" style={{ marginTop: '12px' }}>
                    <ShareControl deliveryId={d.id} bookingId={bookingId} status={d.status} shareToken={d.shareToken} />
                    <DeliveryActions deliveryId={d.id} bookingId={bookingId} title={d.title} status={d.status} archived={false} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <NewDeliveryForm bookingId={bookingId} />

          {deliverables.deliveries.some((d: any) => d.archivedAt) && (
            <div style={{ marginTop: '28px' }}>
              <h3 className="q-section-title" style={{ fontSize: '0.95rem' }}>Archived</h3>
              <p className="q-meta" style={{ marginBottom: '12px' }}>
                Superseded, but not touched — a shared link here still works exactly as before.
              </p>
              <div className="q-stack">
                {deliverables.deliveries.filter((d: any) => d.archivedAt).map((d: any) => (
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
                        <DeliveryActions deliveryId={d.id} bookingId={bookingId} title={d.title} status={d.status} archived={true} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
          {/*
            * THE WORK, AS ONE SECTION.
            *
            * The job's shape first - each package, each service, where it is -
            * then who is on it, then the steps. Team and Tasks were two
            * sections in two columns, each opening with "2 tasks are
            * unassigned" and one pointing at the other "below". Who is doing
            * the work and what the work is are one question, asked here once.
            */}
          <Section title="Work" id="work">
          <WorkPositions work={work.positions} />

          <div className="q-subsection">
            <h3 className="q-subsection-title">Crew</h3>
          {work.team.roles.length === 0 ? (
            <p className="q-meta" style={{ marginBottom: '16px' }}>
              Nobody on this booking yet.
            </p>
          ) : (
            <>
              <div className="q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
                {work.team.roles.map((r: any) => (
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
                                bookingId={bookingId}
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
            bookingId={bookingId}
            employees={page.options.employees as any}
            roles={page.options.roles}
          />

          </div>

          <div className="q-subsection">
            <h3 className="q-subsection-title">Steps</h3>
          <BookingTasks
            bookingId={bookingId}
            tasks={work.tasks as any}
            employees={page.options.employees as any}
            roles={page.options.roles}
          />
          </div>
        </Section>
          <Section title="Invoices & Payments" id="money">
          <div className="q-row q-row-between" style={{ marginBottom: '16px' }}>
            <span className="q-meta">
              {money.invoices.length === 0
                ? money.booked > 0
                  ? `Nothing billed yet. ${formatMoney(money.booked, money.currency)} to invoice.`
                  : 'Nothing billed yet — put a price on the packages and this can be invoiced.'
                : money.leftToInvoice > 0
                  ? `${money.invoices.length} ${money.invoices.length === 1 ? 'invoice' : 'invoices'} raised · ${formatMoney(money.leftToInvoice, money.currency)} still to invoice.`
                  : `${money.invoices.length} ${money.invoices.length === 1 ? 'invoice' : 'invoices'} raised · fully invoiced.`}
            </span>
            {/* What makes a booking billable is a price on it - decided in the read. */}
            <GenerateInvoiceButton bookingId={bookingId} canBill={money.canBill}
                                                   leftToInvoice={money.leftToInvoice}
                                                   discounted={money.figures?.discounted ?? 0} currency={money.currency} />
          </div>

          {money.invoices.length > 0 && (
            <div className="q-stack q-stack-sm" style={{ marginBottom: '18px' }}>
              {money.invoices.map((inv: any) => (
                <Link key={inv.id} href={`/finances/invoices/${inv.id}`} className="q-tile q-row q-row-between q-plain-link">
                  <div>
                    <strong className="q-strong">{inv.number || 'Draft invoice'}</strong>
                    <div className="q-meta-sm">
                      {inv.lines.length} {inv.lines.length === 1 ? 'line' : 'lines'}
                      {inv.issued_at ? ` · sent ${new Date(inv.issued_at).toLocaleDateString()}` : ' · not sent yet'}
                    </div>
                  </div>
                  <div className="q-row">
                    <span className="q-num q-strong">{formatMoney(inv.total, inv.currency || money.currency)}</span>
                    <span className={`q-badge ${
                      inv.status === 'void' ? 'q-badge-danger'
                      : inv.settled ? 'q-badge-success'
                      : inv.status === 'draft' ? 'q-badge-neutral' : 'q-badge-warning'
                    }`}>
                      {inv.status === 'void' ? 'withdrawn'
                        : inv.settled ? 'paid'
                        : inv.partly ? `${formatMoney(inv.outstanding, inv.currency || money.currency)} left`
                        : inv.status === 'draft' ? 'draft' : 'unpaid'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {money.figures && (() => {
            const f = money.figures;
            const say = (n: number) => formatMoney(n, money.currency);
            return (
            <div className="q-grid-3" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
              <div className="q-panel">
                <div className="q-stat-label">{f.valueLabel}</div>
                <div className="q-stat-value">{say(f.value)}</div>
              </div>
              <div className="q-panel">
                <div className="q-stat-label">Invoiced</div>
                <div className="q-stat-value">{say(f.invoiced)}</div>
              </div>
              {/* The gap between agreed and invoiced, named: what was given
                  away is a decision, and belongs beside the numbers it explains. */}
              {f.discounted > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Discounted</div>
                  <div className="q-stat-value">{say(f.discounted)}</div>
                </div>
              )}
              <div className="q-panel">
                <div className="q-stat-label">Paid</div>
                <div className="q-stat-value">{say(f.paid)}</div>
              </div>
              {f.leftToInvoice > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Left to invoice</div>
                  <div className="q-stat-value">{say(f.leftToInvoice)}</div>
                </div>
              )}
              {f.leftToPay > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Left to pay</div>
                  <div className="q-stat-value">{say(f.leftToPay)}</div>
                </div>
              )}
              {f.pending > 0 && (
                <div className="q-panel">
                  <div className="q-stat-label">Pending</div>
                  <div className="q-stat-value q-warm">{say(f.pending)}</div>
                </div>
              )}
            </div>
            );
          })()}
          {money.transactions.length === 0 ? (
            <div className="q-muted">No money on this booking yet.</div>
          ) : (
            <div className="q-stack">
              {money.transactions.map((t: any) => (
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
          <Section title="Contract" id="contract">
          {contract.contracts.length > 0 && (
            <div className="q-stack" style={{ marginBottom: contract.hasOpen ? 0 : '12px' }}>
              {contract.contracts.map((c: any) => (
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
          {!contract.hasOpen && (
            <div>
              <div className="q-muted">
                {contract.contracts.length === 0
                  ? "No contract yet — this booking runs fine without one. Terms can be added at any time."
                  : 'Every contract on this booking is closed out — a new one can be drafted at any time.'}
              </div>
              {/* Offered only once the booking can supply a scope and a price;
                  why it cannot yet is the read's to say. */}
              {contract.blocker
                ? <div className="q-meta-sm">{contract.blocker}</div>
                : <CreateContractButton bookingId={bookingId} label={contract.contracts.length === 0 ? 'Create a contract' : 'Draft a new contract'} />}
            </div>
          )}
        </Section>
          <Section title="Client confirmation" id="confirmation">
          <ShareBooking
            bookingId={bookingId}
            bookingTitle={head.title}
            shareToken={page.confirmation.shareToken}
            sharedAt={page.confirmation.sharedAt}
            hasClient={page.confirmation.hasClient}
          />
        </Section>
          <Section title="Notes">
          <NotesFor
            about={{ type: 'booking', id: bookingId }}
            aboutLabel="this booking"
            notes={page.notes}
          />
        </Section>
      </div>
    </div>
  );
}

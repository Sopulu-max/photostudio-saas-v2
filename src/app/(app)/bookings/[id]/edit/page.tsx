import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getBooking, suggestedDurationForBooking, getLineConfigurationForm, getEnquiryForBooking, getBookingClassification, readRequestCoverage, lineNameOf } from '@/modules/bookings/interface';
import { listClients } from '@/modules/clients/interface';
import { listPackages, getOpenQuestionsForPackage, getPackage } from '@/modules/packages/interface';
import { amountOf, firstPriced, extrasAmount } from '@/kernel/money';
import { listInvoicesForBooking } from '@/modules/finances/interface';
import { getBookingWork, getBookingTeam } from '@/modules/production/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { studioTimezone } from '@/kernel/studioHours';
import { listDimensionsByDomain, needsPremises } from '@/modules/services/interface';
import { packageNarrowingValueIds } from '@/modules/packages/interface';
import { formatMoney } from '@/kernel/currency';
import { BookingRecordForm } from './BookingRecordForm';
import { AddLineForm } from '../AddLineForm';
import { LineActions } from '../LineActions';
import { LineQuestionsEditor } from './LineQuestionsEditor';
import { LinePrice } from './LinePrice';
import { LineExtras } from '../LineExtras';
import { ResolveEnquiry } from '../ResolveEnquiry';
import { BookingClassification } from '../BookingClassification';
import { LinePackageEditor } from './LinePackageEditor';
/*
 * The same loader /packages/[id]/edit uses. A booking line points at a package
 * instance, so configuring what this booking is for IS editing a package — and
 * it must be the same editor, handed the same catalogues, or the two drift.
 */
import { loadPackageEditorCatalogs, loadPackageForEditor } from '../../../packages/[id]/editorData';
import { DeleteBookingButton } from '../BookingHeaderActions';

export const dynamic = 'force-dynamic';

/**
 * Editing the booking's record — what was agreed, as opposed to how the work
 * is going. The detail page keeps everything operational (stage, crew, tasks,
 * delivery, money) so routine work never costs a trip through an editor.
 */
export default async function EditBookingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let orgId: string;
  try {
    orgId = (await getAuthOrgId()).orgId;
  } catch {
    redirect('/login');
  }

  const booking = await getBooking(params.id);
  if (!booking) notFound();

  const lineIds = booking.lines.map((l: any) => l.id);
  const lines = booking.lines as any[];
  const packaged = lines.filter((l) => l.package_id);

  /*
   * ONE WAIT FOR EVERYTHING THAT DOES NOT DEPEND ON ANOTHER ANSWER.
   *
   * This page used to ask in eleven waves, three of them once per line: the
   * line's configuration, then the questions its package leaves open, then the
   * package itself, then the same package again for the editor - each waiting
   * for the line before it. A booking of three packages therefore waited
   * seventeen times in series, and a booking of six waited twice that, so the
   * editor got slower the more a client bought. None of those answers is
   * needed to ask for another, and a line knows nothing of its neighbours, so
   * they are all asked at once. Only what is genuinely derived waits: whether
   * the studio's own building is needed, which is read from what the packages
   * narrow to.
   */
  const [
    clientRows, packageRows, suggestedMinutes, currencyCode, enquiry, timeZone, dimensionsByDomain,
    classification, coverage, editorCatalogs, invoices, bookingWork, team,
    narrowedPerLine, configPerLine, questionsPerLine, deepPerLine, editorPerLine,
  ] = await Promise.all([
    listClients(),
    listPackages(),
    suggestedDurationForBooking(booking.id),
    getStudioCurrency(),
    getEnquiryForBooking(booking.id),
    // Whose wall clock the date field shows and sends.
    studioTimezone(orgId),
    // What the catalogue can be narrowed by — the studio's own vocabulary.
    listDimensionsByDomain(),
    /*
     * WHAT THE STUDIO UNDERSTANDS THIS BOOKING TO BE FOR.
     *
     * Its own fact, seeded from the client's answers and correctable — as
     * opposed to what they submitted, which stays in metadata as the record.
     * The editor needs both: one to show, one to compare against.
     */
    getBookingClassification(booking.id),
    // Whether what they asked for is answered by what is on the booking - the
    // set test, not a flag.
    readRequestCoverage(booking.id),
    // The catalogues the package editor is handed, loaded once for the page.
    loadPackageEditorCatalogs(),
    listInvoicesForBooking(booking.id),
    getBookingWork(booking.id),
    getBookingTeam(booking.id),
    Promise.all(packaged.map((l) => packageNarrowingValueIds(orgId, l.package_id))),
    // Configuration is per line, and so are the questions its package left
    // open, which is what the operator answers here.
    Promise.all(lines.map((l) => getLineConfigurationForm(l.id))),
    Promise.all(packaged.map((l) => getOpenQuestionsForPackage(l.package_id)
      .catch(() => ({ variables: [], classifications: [], formSchema: [] })))),
    // Each line's package as the booking reads it, for the extras it may take.
    Promise.all(packaged.map((l) => getPackage(l.package_id).catch(() => null))),
    /*
     * And what each line's package actually IS. The instance behind each line
     * is read per line, because that is what the editor edits. A line whose
     * package has been removed simply gets no editor rather than an empty one.
     */
    Promise.all(packaged.map((l) => loadPackageForEditor(l.package_id))),
  ]);
  const work = {} as Record<string, any>;
  const contracts = ((booking as any).contracts || []) as any[];

  const configByLine: Record<string, any[]> = Object.fromEntries(lines.map((l, i) => [l.id, configPerLine[i]]));
  const questionsByLine: Record<string, any> = Object.fromEntries(packaged.map((l, i) => [l.id, questionsPerLine[i]]));
  const deepByLine: Record<string, any> = Object.fromEntries(packaged.map((l, i) => [l.id, deepPerLine[i]]));
  const packageByLine: Record<string, any> = Object.fromEntries(
    packaged.flatMap((l, i) => (editorPerLine[i] ? [[l.id, editorPerLine[i]] as const] : [])),
  );
  const intakeAnswers = (((booking as any).metadata?.form_responses ?? {}) as Record<string, any>);

  const understoodByDimension = Object.fromEntries(
    classification.map((c) => [c.dimensionId, c.valueId]),
  ) as Record<string, string>;
  /* Deduplicated across domains: one question offered by two domains is still
     one question, exactly as the catalogue picker treats it. */
  const askedDimensions = [...new Map(
    Object.values(dimensionsByDomain).flat().map((d: any) => [d.id, d]),
  ).values()] as any[];

  /*
   * Whether this booking needs the studio's own building.
   *
   * Read from what is on it — each line's package narrowing, plus what the
   * client answered if it is still an enquiry. Opening hours constrain a
   * session held at the studio and say nothing about a wedding at somebody
   * else's venue, so the date field only mentions them when they apply.
   */
  const bookedValueIds = [
    ...narrowedPerLine.flat(),
    ...Object.values(
      ((booking as any).metadata?.form_responses?.dimensions ?? {}) as Record<string, string>,
    ).filter(Boolean),
  ];
  const atPremises = await needsPremises(bookedValueIds);

  // Archived clients aren't offered for a new assignment — same rule as retired packages.
  // Phone and email come along, because they are how an operator tells two
  // clients of the same name apart — and the picker fills them in on select.
  const clientOptions = clientRows
    .filter((c: any) => c.status !== 'archived')
    .map((c: any) => ({
      id: c.contact?.id as string,
      name: c.contact?.display_name as string,
      email: (c.contact?.email ?? null) as string | null,
      phone: (c.contact?.phone ?? null) as string | null,
    }))
    .filter((c: { id: string }) => !!c.id);

  /*
   * The whole package, not an id and a name.
   *
   * This was flattened to `{ id, name }` because a <select> was all that read
   * it. The picker shows what the new-booking form shows — cover, price,
   * services, what it promises — and narrows by classification, so it needs the
   * row rather than a label.
   */
  const packageOptions = (packageRows as any[])
    .filter((p) => p.status !== 'retired')
    .map((p) => ({
      ...p,
      coverUrl: (p.cover_url ?? null) as string | null,
      coverPosition: (p.cover_position ?? null) as string | null,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));


  return (
    <div className="q-page-narrow">
      <Link href={`/bookings/${booking.id}`} className="q-back">&larr; Back to the booking</Link>
      <header className="q-page-header">
        <div>
          {/* Inverted before this: the generic word in the largest type and
              the name of the actual booking in the quiet line beneath it, so
              the page shouted what you were doing and murmured what you were
              doing it to. */}
          <span className="q-eyebrow">Editing</span>
          <h1 className="q-page-title">{booking.title}</h1>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <BookingRecordForm
          bookingId={booking.id}
          title={booking.title}
          contactId={booking.contact?.id ?? null}
          scheduledFor={booking.scheduled_for}
          durationMinutes={booking.duration_minutes}
          brief={booking.brief ?? null}
          suggestedMinutes={suggestedMinutes}
          clients={clientOptions}
          timeZone={timeZone}
          atPremises={atPremises}
        >

        {/*
          Lines are child records with their own lifecycle, so they commit as
          you go rather than waiting for the form's Save — adding a package and
          removing one are separate decisions, each worth its own event in the
          log. The form above owns the single booking row; this owns a list.
        */}
        <div className="q-card q-section">
          <h2 className="q-section-title">2. Packages</h2>
          <p className="q-meta" style={{ marginBottom: '14px' }}>
            Each package: what it left open, its price for this booking, and anything taken beyond it. Changes here apply straight away.
          </p>

          {booking.lines.length === 0 ? (
            <div className="q-stack q-stack-sm">
              <p className="q-empty">Nothing on this booking yet — add a package once the client's choice is known.</p>
            </div>
          ) : (
            <div className="q-stack">
              {booking.lines.map((l: any) => {
                const w = work[l.id];
                /*
                 * Read off the line's own instance, not the catalogue.
                 * listPackages does not return instances — they are status
                 * 'custom' — so this lookup found nothing for every booking
                 * made from a package, and the line showed no services at all.
                 */
                const linePkg = packageByLine[l.id]?.pkg
                  ?? (packageRows as any[]).find((p) => p.id === l.package_id);
                const svcNames = ((linePkg?.services || []) as any[]).map((s: any) => s.name).filter(Boolean);
                return (
                  <div key={l.id} className="q-tile">
                    <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong className="q-strong">{lineNameOf(l)}</strong>
                        {svcNames.length > 0 && <div className="q-meta-sm">{svcNames.join(' · ')}</div>}
                        {/* What this package left open, asked under it - the
                            same list the booking was taken with. */}
                        {questionsByLine[l.id] && (
                          <LineQuestionsEditor
                            bookingId={booking.id}
                            lineId={l.id}
                            packageId={l.package_id}
                            questions={questionsByLine[l.id]}
                            classification={understoodByDimension}
                            intake={intakeAnswers}
                            answers={Object.fromEntries(
                              (configByLine[l.id] || [])
                                .filter((f: any) => f.value != null)
                                .map((f: any) => [f.serviceVariableId, String(f.value)]),
                            )}
                          />
                        )}
                        {/* Its price for this booking, where it was at creation. */}
                        {l.package_id && (
                          <LinePrice
                            bookingId={booking.id}
                            lineId={l.id}
                            basePrice={amountOf(firstPriced(linePkg?.price, l.price)) || null}
                            catalogPrice={packageByLine[l.id]?.derivedFrom
                              ? (amountOf((packageRows as any[]).find((p) => p.name === packageByLine[l.id].derivedFrom)?.price) || null)
                              : null}
                            currency={(firstPriced(linePkg?.price, l.price) as any)?.currency || currencyCode}
                          />
                        )}
                        {/* More of what it promises - read, changed, taken. */}
                        {deepByLine[l.id] && (
                          <LineExtras
                            lineId={l.id}
                            currencyCode={currencyCode}
                            promises={((deepByLine[l.id].services || []) as any[]).flatMap((s: any) =>
                              ((s.deliverables || []) as any[]).map((d: any) => ({
                                packageServiceId: s.packageServiceId as string,
                                deliverableId: d.id as string,
                                name: d.name as string,
                                quantity: (d.quantity ?? null) as number | null,
                                serviceName: s.name as string,
                                rate: amountOf(((s.offers || []) as any[]).find((o: any) => o.id === d.id)?.rate) || null,
                              })))}
                            taken={((l.extras || []) as any[]).map((x: any) => ({
                              id: x.id, label: x.label, units: Number(x.units), unit_rate: x.unit_rate,
                              billedOn: ((x.billed || []) as any[])
                                .map((b: any) => b.invoice).filter((i: any) => i && !i.voided_at)
                                .map((i: any) => ({ id: i.id as string, number: (i.number ?? null) as string | null, status: i.status as string })),
                            }))}
                          />
                        )}
                      </div>
                      <LineActions
                        bookingId={booking.id}
                        lineId={l.id}
                        title={lineNameOf(l)}
                        basePrice={(l.price as any)?.base_price ?? null}
                        quantity={Number(l.quantity ?? 1)}
                        unit={(l.price as any)?.unit ?? null}
                        currency={(l.price as any)?.currency || currencyCode}
                        hasWork={!!w}
                        charge={!l.package_id}
                      />
                    </div>
                    {packageByLine[l.id] && (
                      <LinePackageEditor
                        bookingId={booking.id}
                        lineId={l.id}
                        /* Its own copy, or the catalogue row itself. A booking
                           taken before instancing existed points at the latter,
                           and must not be edited from here. */
                        isOwnCopy={
                          !!packageByLine[l.id].pkg.instance_of
                          || packageByLine[l.id].pkg.status === 'custom'
                        }
                        packageId={l.package_id}
                        status={packageByLine[l.id].pkg.status}
                        catalogs={editorCatalogs as any}
                        initial={packageByLine[l.id].initial}
                        /* What it is an instance OF, so the editor states what
                           the package is rather than asking it again. */
                        derivedFrom={packageByLine[l.id].derivedFrom}
                        derivedServiceIds={packageByLine[l.id].derivedServiceIds}
                      />
                    )}

                    {w && (
                      <div className="q-meta-sm q-tile-sub">
                        Work has started on this one — {w.completed}/{w.total} done. Removing it takes the work too.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/*
            * FROM WHAT THEY ASKED FOR TO A PACKAGE - the enquiry's path, in the
            * place the creation form offers the catalogue. Shown only while
            * something they asked for is not answered by a package on the
            * booking: with none on it, the studio's understanding is asked for
            * and the descent runs (sell it, assemble it, or a catalogue
            * decision); with packages on it that leave an answer uncovered,
            * the descent runs about that. Answered, the packages speak and
            * this says nothing - "partly fulfilled" was lines.length > 0,
            * a verdict that compared nothing with nothing.
            */}
          {!coverage.covered && (
            <div className="q-stack q-stack-sm" style={{ marginBottom: '16px' }}>
              {booking.lines.every((l: any) => !l.package_id) ? (
                askedDimensions.length > 0 && (
                  <div className="q-tile">
                    <BookingClassification
                      bookingId={booking.id}
                      dimensions={askedDimensions}
                      current={understoodByDimension}
                    />
                  </div>
                )
              ) : (
                coverage.answers.some((a) => a.coveredBy.length === 0) && (
                  <p className="q-meta">
                    {coverage.answers.filter((a) => a.coveredBy.length === 0).map((a) => (
                      <span key={a.dimensionId} style={{ marginRight: '12px' }}>
                        {a.dimensionName}: <strong className="q-strong">{a.valueName}</strong>
                        <span className="q-text-danger"> · nothing on the booking covers this</span>
                      </span>
                    ))}
                  </p>
                )
              )}
              {enquiry && (
                <ResolveEnquiry
                  bookingId={booking.id}
                  chosen={enquiry.chosen}
                  message={enquiry.message}
                  offers={enquiry.offers}
                  capabilities={enquiry.capabilities}
                  currencyCode={currencyCode}
                  alreadyOn={booking.lines.some((l: any) => l.package_id)}
                />
              )}
            </div>
          )}

          <AddLineForm
            bookingId={booking.id}
            packages={packageOptions}
            /* Deduplicated across domains: the same dimension offered by two
               domains is one question, not two. */
            dimensions={[...new Map(
              Object.values(dimensionsByDomain).flat().map((d: any) => [d.id, d]),
            ).values()] as any}
            /* The ids themselves, not a function over them — this page is a
               server component and a closure cannot cross into a client one. */
            packagesOnBooking={booking.lines.map((l: any) => l.package_id).filter(Boolean)}
            currencyCode={currencyCode}
          />
          {booking.lines.length > 0 && (
            <div className="q-tile-sub q-row q-row-between">
              <span className="q-meta">Total</span>
              <strong className="q-stat-value">
                {/* The same sum the booking page and the invoice read: each
                    line at its own instance's price, plus what was taken
                    beyond it. This read only the line's own price column,
                    so a package line (priced on its instance) counted as 0
                    and an extra counted for nothing. */}
                {formatMoney(
                  booking.lines.reduce(
                    (sum: number, l: any) => sum + amountOf(firstPriced(l.package?.price, l.price)) * Number(l.quantity ?? 1) + extrasAmount(l.extras),
                    0
                  ),
                  (booking.lines.map((l: any) => firstPriced(l.package?.price, l.price) as any).find((p: any) => p?.currency)?.currency) || currencyCode
                )}
              </strong>
            </div>
          )}

        </div>
        {/*
          * 3. WHAT FOLLOWS - in the place it had when the booking was taken.
          *
          * Taking a booking runs through three sections: the record, the
          * packages, and what follows from them - the work, the invoice, the
          * contract, the client's confirmation. Those are done on the booking
          * itself, deliberately: they are how the job is going rather than
          * what was agreed, and none should cost a trip through an editor.
          * But an operator who came here from the form they filled in
          * reasonably looks for section 3 where it was, so it is here as a
          * reading, each line pointing at where it is done.
          */}
        <div className="q-card q-section">
          <h2 className="q-section-title">3. What follows</h2>
          <p className="q-meta" style={{ marginBottom: '14px' }}>
            Raised from what is above, and managed on{' '}
            <Link href={`/bookings/${booking.id}`} className="q-plain-link">the booking</Link>.
          </p>
          <div className="q-stack q-stack-sm">
            <div className="q-tile q-row q-row-between">
              <span><strong className="q-strong">Work</strong>
                <span className="q-meta-sm" style={{ marginLeft: '8px' }}>
                  {bookingWork.total === 0
                    ? 'No steps yet.'
                    : `${bookingWork.done} of ${bookingWork.total} steps done` + (team.unfilled > 0 ? ` · ${team.unfilled} unassigned` : '')}
                </span>
              </span>
              <Link href={`/bookings/${booking.id}#work`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
            </div>
            <div className="q-tile q-row q-row-between">
              <span><strong className="q-strong">Invoices</strong>
                <span className="q-meta-sm" style={{ marginLeft: '8px' }}>
                  {invoices.length === 0 ? 'None raised.' : `${invoices.length} raised` + (invoices.some((i: any) => i.status === 'draft') ? ' · a draft not yet sent' : '')}
                </span>
              </span>
              <Link href={`/bookings/${booking.id}#money`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
            </div>
            <div className="q-tile q-row q-row-between">
              <span><strong className="q-strong">Contract</strong>
                <span className="q-meta-sm" style={{ marginLeft: '8px' }}>
                  {contracts.length === 0 ? 'None yet.' : `v${Math.max(...contracts.map((c: any) => Number(c.version) || 1))} · ${contracts[contracts.length - 1]?.status ?? ''}`}
                </span>
              </span>
              <Link href={`/bookings/${booking.id}#contract`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
            </div>
            <div className="q-tile q-row q-row-between">
              <span><strong className="q-strong">Client confirmation</strong>
                <span className="q-meta-sm" style={{ marginLeft: '8px' }}>
                  {(booking as any).shared_at ? 'Shared with the client.' : 'Not prepared yet.'}
                </span>
              </span>
              <Link href={`/bookings/${booking.id}#confirmation`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
            </div>
          </div>
        </div>
        </BookingRecordForm>

        {/* Deleting is the one thing here with nothing to undo it, so it sits
            apart from the fields rather than beside a Save button. */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Delete booking</h2>
          <p className="q-meta" style={{ marginBottom: '14px' }}>
            If the job simply isn&rsquo;t happening, move it to a cancelled status instead — that keeps the record.
            Deleting is for bookings created by mistake.
          </p>
          <DeleteBookingButton bookingId={booking.id} />
        </div>
      </div>
    </div>
  );
}

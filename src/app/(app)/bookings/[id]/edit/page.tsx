import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getBooking, suggestedDurationForBooking, getLineConfigurationForm, getEnquiryForBooking, getBookingClassification } from '@/modules/bookings/interface';
import { listClients } from '@/modules/clients/interface';
import { listPackages, getOpenQuestionsForPackage } from '@/modules/packages/interface';
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
  const [clientRows, packageRows, suggestedMinutes, currencyCode, work, enquiry, timeZone, dimensionsByDomain] = await Promise.all([
    listClients(),
    listPackages(),
    suggestedDurationForBooking(booking.id),
    getStudioCurrency(),
    Promise.resolve({} as Record<string, any>),
    getEnquiryForBooking(booking.id),
    // Whose wall clock the date field shows and sends.
    studioTimezone(orgId),
    // What the catalogue can be narrowed by — the studio's own vocabulary.
    listDimensionsByDomain(),
  ]);

  /*
   * WHAT THE STUDIO UNDERSTANDS THIS BOOKING TO BE FOR.
   *
   * Its own fact, seeded from the client's answers and correctable — as
   * opposed to what they submitted, which stays in metadata as the record.
   * The editor needs both: one to show, one to compare against.
   */
  const classification = await getBookingClassification(booking.id);
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
    ...(await Promise.all(
      (booking.lines as any[]).filter((l) => l.package_id)
        .map((l) => packageNarrowingValueIds(orgId, l.package_id)),
    )).flat(),
    ...Object.values(
      ((booking as any).metadata?.form_responses?.dimensions ?? {}) as Record<string, string>,
    ).filter(Boolean),
  ];
  const atPremises = await needsPremises(bookedValueIds);

  // Configuration is per line, so it's fetched per line - and so are the
  // questions its package left open, which is what the operator answers here.
  const configByLine: Record<string, any[]> = {};
  const questionsByLine: Record<string, any> = {};
  for (const l of booking.lines as any[]) {
    configByLine[l.id] = await getLineConfigurationForm(l.id);
    if (l.package_id) {
      questionsByLine[l.id] = await getOpenQuestionsForPackage(l.package_id)
        .catch(() => ({ variables: [], classifications: [], formSchema: [] }));
    }
  }
  const intakeAnswers = (((booking as any).metadata?.form_responses ?? {}) as Record<string, any>);

  // What follows from the record - done on the booking, summarised here so
  // the page reads in the same order it was written.
  const [invoices, bookingWork, team, contracts] = await Promise.all([
    listInvoicesForBooking(booking.id),
    getBookingWork(booking.id),
    getBookingTeam(booking.id),
    Promise.resolve(((booking as any).contracts || []) as any[]),
  ]);

  /*
   * And what each line's package actually IS.
   *
   * The catalogues are loaded once for the page; the instance behind each line
   * is read per line, because that is what the editor edits. A line whose
   * package has been removed simply gets no editor rather than an empty one.
   */
  const editorCatalogs = await loadPackageEditorCatalogs();
  const packageByLine: Record<string, any> = {};
  for (const l of booking.lines as any[]) {
    if (!l.package_id) continue;
    const loaded = await loadPackageForEditor(l.package_id);
    if (loaded) packageByLine[l.id] = loaded;
  }

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
          coverUrl={(booking as any).cover_url ?? null}
          coverPosition={(booking as any).cover_position ?? null}
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
            Each package, and what it left open. Changes here apply straight away — each package added or removed is its own change.
          </p>

          {booking.lines.length === 0 ? (
            <div className="q-stack q-stack-sm">
              <p className="q-empty">Nothing on this booking yet — add a package whenever you know what they want.</p>
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
                    <div className="q-row q-row-between">
                      <div>
                        <strong className="q-strong">{l.title}</strong>
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
                      </div>
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

          {booking.lines.length > 0 && (
            <div className="q-tile-sub q-row q-row-between">
              <span className="q-meta">Total</span>
              <strong className="q-stat-value">
                {formatMoney(
                  booking.lines.reduce(
                    (sum: number, l: any) => sum + Number(l.price?.base_price || 0) * Number(l.quantity ?? 1),
                    0
                  ),
                  (booking.lines[0]?.price as any)?.currency || currencyCode
                )}
              </strong>
            </div>
          )}

          {/*
            * WHAT IT IS FOR, BEFORE WHAT CAN ANSWER IT.
            *
            * Above the resolver on purpose: the lists below are computed from
            * this, so an operator who reads them and thinks "that is not what
            * they wanted" needs the correction in front of them, not after.
            *
            * ONLY WHEN NOTHING ON THE BOOKING NARROWS IT. With a package on
            * the booking, what it is for is answered by the package (settled)
            * or asked under it (left open, among the values it allows). This
            * offered every question with every value the studio has - Burial
            * for a children's portrait session, a Context the package had
            * already fixed - beside the package that had settled them.
            */}
          {askedDimensions.length > 0 && booking.lines.every((l: any) => !l.package_id) && (
            <div className="q-tile" style={{ marginBottom: '16px' }}>
              <BookingClassification
                bookingId={booking.id}
                dimensions={askedDimensions}
                current={understoodByDimension}
              />
            </div>
          )}

          {/* What the client described, and what can answer it — whether or
              not something is already on the booking. */}
          {enquiry && (
            <div style={{ marginBottom: '16px' }}>
              <ResolveEnquiry
                bookingId={booking.id}
                chosen={enquiry.chosen}
                message={enquiry.message}
                offers={enquiry.offers}
                capabilities={enquiry.capabilities}
                currencyCode={currencyCode}
                alreadyOn={booking.lines.length > 0}
              />
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
            If the job simply isn&rsquo;t happening, move it to a cancelled stage instead — that keeps the record.
            Deleting is for bookings created by mistake.
          </p>
          <DeleteBookingButton bookingId={booking.id} />
        </div>
      </div>
    </div>
  );
}

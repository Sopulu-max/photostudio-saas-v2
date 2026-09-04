import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getBooking, suggestedDurationForBooking, getLineConfigurationForm, getEnquiryForBooking } from '@/modules/bookings/interface';
import { listClients } from '@/modules/clients/interface';
import { listPackages } from '@/modules/packages/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { studioTimezone } from '@/kernel/studioHours';
import { formatMoney } from '@/kernel/currency';
import { BookingRecordForm } from './BookingRecordForm';
import { AddLineForm } from '../AddLineForm';
import { LineActions } from '../LineActions';
import { LineConfigForm } from '../LineConfigForm';
import { EnquiryPanel } from '../EnquiryPanel';
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
  const [clientRows, packageRows, suggestedMinutes, currencyCode, work, enquiry, timeZone] = await Promise.all([
    listClients(),
    listPackages(),
    suggestedDurationForBooking(booking.id),
    getStudioCurrency(),
    Promise.resolve({} as Record<string, any>),
    getEnquiryForBooking(booking.id),
    // Whose wall clock the date field shows and sends.
    studioTimezone(orgId),
  ]);

  // Configuration is per line, so it's fetched per line.
  const configByLine: Record<string, any[]> = {};
  for (const id of lineIds) configByLine[id] = await getLineConfigurationForm(id);

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

  const packageOptions = (packageRows as any[])
    .filter((p) => p.status !== 'retired')
    .map((p) => ({ id: p.id as string, name: p.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const variantsByPackage: Record<string, any> = {};
  for (const p of packageRows as any[]) {
    if (p.status !== 'retired' && p.pricing_variant) variantsByPackage[p.id] = p.pricing_variant;
  }

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
        >

        {/*
          Lines are child records with their own lifecycle, so they commit as
          you go rather than waiting for the form's Save — adding a package and
          removing one are separate decisions, each worth its own event in the
          log. The form above owns the single booking row; this owns a list.
        */}
        <div className="q-card q-section">
          <h2 className="q-section-title">What they&rsquo;re booking</h2>
          <p className="q-meta" style={{ marginBottom: '14px' }}>
            Changes here apply straight away — each package added or removed is its own change.
          </p>

          {booking.lines.length === 0 ? (
            <div className="q-stack q-stack-sm">
              <p className="q-empty">Nothing on this booking yet — add a package whenever you know what they want.</p>
              {/* A custom enquiry said something; this is where it gets acted on. */}
              {enquiry && <EnquiryPanel bookingId={booking.id} enquiry={enquiry} />}
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
                        <LineConfigForm bookingId={booking.id} lineId={l.id} fields={configByLine[l.id] || []} />
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

          <AddLineForm
            bookingId={booking.id}
            packages={packageOptions}
            variantsByPackage={variantsByPackage}
            currencyCode={currencyCode}
          />
        </div>
        </BookingRecordForm>

        {/*
          * WHERE THE REST OF THE JOB IS.
          *
          * Taking a booking internally runs through six sections — the record,
          * the packages, the work, the invoice, the contract, the client's
          * confirmation. Editing one shows the first two, and an operator who
          * came here to change something reasonably wonders where the other
          * four went.
          *
          * They are on the booking itself, deliberately: they are how the work
          * is going rather than what was agreed, and they are all things you
          * should be able to do without opening an editor first. What was
          * missing was anybody saying so — the same sentence the new-booking
          * form ends with, for the same reason.
          */}
        <p className="q-meta-sm">
          Crew, tasks, deliveries, invoices and the contract live on{' '}
          <Link href={`/bookings/${booking.id}`} className="q-plain-link">the booking itself</Link>,
          where they can be changed without coming through here.
        </p>

        {/* Deleting is the one thing here with nothing to undo it, so it sits
            apart from the fields rather than beside a Save button. */}
        <div className="q-card q-section">
          <h2 className="q-section-title">If this booking shouldn&rsquo;t exist</h2>
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

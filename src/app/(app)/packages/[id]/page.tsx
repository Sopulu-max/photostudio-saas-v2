import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { CoverSlides } from '@/components/CoverSlides';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatDeliverable, getPackage } from '@/modules/packages/interface';
import { listBookingsOfPackage } from '@/modules/bookings/interface';
import { stageBadgeClass } from '@/components/stageBadge';
import { SheetRow, initialsFor } from '@/components/Sheet';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { formatVariableValue, splitVariables } from '@/modules/services/interface';
import { ClassificationsFor } from './Classifications';
import { Counted } from '@/components/Counted';
import { PrintHead, PrintFacts } from '@/components/Print';
import { StorefrontLink } from '../StorefrontLink';

export const dynamic = 'force-dynamic';

export default async function PackageDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const pkg = await getPackage(params.id);
  if (!pkg) notFound();

  const [currencyCode, org, bookedOn] = await Promise.all([
    getStudioCurrency(),
    getStudio(),
    /* Where this package has been booked: derived from the lines that
       instance it. A catalogue package is never on a booking itself. */
    (pkg as any).instance_of ? Promise.resolve([]) : listBookingsOfPackage(pkg.id),
  ]);

  const services = (pkg as any).services || [];

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/packages">&larr; Back to Packages</Link>

      {/*
        * THE PRINT: THE PLATE AND THE LABEL.                    (D1, D2, D4)
        *
        * The pictures on the left, the label beside them - a gallery's
        * arrangement, not a website's cover photo. The label reads top to
        * bottom the way a client asks: what is this made of, what is it
        * called, what does it cost, what do I get, then the particulars, then
        * Book. Everything below the print is the deep read, on hairlines.
        */}
      {(() => {
        const bundle = services.map((s: any) => s.name).join(' + ');
        const promised = services.flatMap((s: any) => s.deliverables || []);
        const priced = pkg.price?.amount != null;
        const retired = pkg.status === 'retired';
        const instance = Boolean((pkg as any).instance_of);
        const images = ((pkg as any).images || []) as any[];

        /* What it is FOR, collated across the bundle by the rule Classifications
           states: a service that narrows nothing is classified as it is
           everywhere. Values merged by question. */
        const byQuestion = new Map<string, { name: string; position: number; values: Map<string, string> }>();
        for (const s of services) {
          const narrowed = s.narrowedTo || [];
          const tags = narrowed.length ? narrowed : (s.dimensions || []);
          for (const d of tags) {
            const q = byQuestion.get(d.id) ?? { name: d.name, position: d.position ?? 0, values: new Map() };
            for (const v of d.values || []) q.values.set(v.id, v.name);
            byQuestion.set(d.id, q);
          }
        }
        const questions = [...byQuestion.values()].sort((a, b) => a.position - b.position);
        const { fixed } = splitVariables(
          services.flatMap((s: any) => s.variableValues || []),
          services.flatMap((s: any) => s.variables || []),
        );
        const steps = services.flatMap((s: any) => s.tasks || []);
        const roles = [...new Set(steps.map((x: any) => x.roleName).filter(Boolean))] as string[];
        const SHOW = 3;

        return (
          <section className="q-print">
            <div className="q-print-plate">
              {images.length > 0
                ? <CoverSlides slides={images} className="q-slides" />
                : <Link href={`/packages/${pkg.id}/edit`} className="q-print-plate-empty q-plain-link">Add a picture</Link>}
            </div>

            <div className="q-print-label">
              <PrintHead
                stamp={bundle || undefined}
                name={pkg.name}
                badge={(retired || instance)
                  ? <span className="q-badge q-badge-neutral">{instance ? 'Booking copy' : 'Retired'}</span>
                  : undefined}
              />

              <div className="q-print-lede">
                <div className="q-print-price">
                  {priced
                    ? <>{formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))}
                        {(pkg as any).price_unit && <span className="q-print-price-unit">/{(pkg as any).price_unit}</span>}</>
                    : <span className="q-absent" style={{ fontSize: '0.6em', fontFamily: 'var(--q-font-sans)', fontWeight: 400 }}>Not priced</span>}
                </div>
                <div className="q-print-promise">
                  {promised.length > 0
                    ? promised.map((d: any, i: number) => (
                        <span key={d.id ?? i}>{i > 0 && ' · '}<Counted text={formatDeliverable(d)} /></span>
                      ))
                    : <span className="q-absent">Nothing promised yet</span>}
                </div>
              </div>

              <PrintFacts facts={[
                ...questions.map((q) => {
                  const names = [...q.values.values()];
                  return { key: q.name, value: names.slice(0, SHOW).join(', '),
                           more: names.length > SHOW ? `+${names.length - SHOW}` : undefined };
                }),
                ...fixed.map((v: any) => ({ key: v.label ?? v.name, value: formatVariableValue(v) })),
                ...(pkg.duration_minutes != null ? [{ key: 'Duration', value: `${pkg.duration_minutes} minutes` }] : []),
                {
                  key: 'Work',
                  value: steps.length > 0
                    ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}${roles.length > 0 ? ` · needs ${roles.join(', ')}` : ''}`
                    : null,
                  absent: 'No work defined',
                },
              ]} />

              {pkg.description && (
                <p className="q-print-brief" style={{ marginTop: '18px', marginBottom: 0 }}>{pkg.description}</p>
              )}

              <div className="q-print-actions">
                {/* Book leads: a catalogue exists to take bookings. Withdrawn
                    and borrowed packages do not offer it. */}
                {!retired && !instance && (
                  <Link href={`/bookings/new?package=${pkg.id}`} className="q-btn q-btn-primary" title={`Take a booking for ${pkg.name}`}>Book</Link>
                )}
                <Link href={`/packages/${pkg.id}/edit`} className="q-btn q-btn-secondary">Edit package</Link>
              </div>
            </div>
          </section>
        );
      })()}

      {/*
        * WHERE IT HAS BEEN BOOKED.
        *
        * The one thing this page never had: the question a studio actually
        * brings to a package - is it selling. A booking never points at the
        * catalogue package, only at its own copy, so this is the copies read
        * back to their origin. Newest first. A borrowed package is a booking's
        * copy and has no bookings of its own.
        */}
      {!(pkg as any).instance_of && (
        <section className="q-print-part">
          <div className="q-print-part-head">
            <h2 className="q-print-part-title">Where it has been booked</h2>
            <p className="q-print-part-note">
              {bookedOn.length === 0
                ? 'Not yet.'
                : `${bookedOn.length} ${bookedOn.length === 1 ? 'booking' : 'bookings'}, newest first.`}
            </p>
          </div>
          {bookedOn.length > 0 && (
            <div className="q-sheet">
              {bookedOn.slice(0, 8).map((b) => (
                <SheetRow key={b.lineId} item={{
                  id: b.lineId,
                  href: `/bookings/${b.id}`,
                  name: b.title,
                  caption: [
                    b.scheduledFor ? new Date(b.scheduledFor).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
                    b.clientName,
                  ],
                  absent: 'No date or client yet',
                  frame: { initials: initialsFor(b.clientName) },
                  figure: b.price?.amount != null
                    ? { text: formatMoney(Number(b.price.amount), String(b.price.currency || currencyCode)) }
                    : undefined,
                  badge: b.stage?.name ? <span className={`q-badge ${stageBadgeClass(b.stage)}`}>{b.stage.name}</span> : undefined,
                }} />
              ))}
            </div>
          )}
        </section>
      )}

      {/*
        * HOW IT IS SOLD. The link for this one package - the commonest thing
        * a studio hands out, and until recently nothing in the app would tell
        * you its address. Shown only when the link would actually work.
        */}
      {org?.slug && (
        <section className="q-print-part">
          <div className="q-print-part-head">
            <h2 className="q-print-part-title">How it is sold</h2>
            <p className="q-print-part-note">
              {pkg.status === 'active' && !(pkg as any).instance_of
                ? 'Send this to a client to book this package.'
                : (pkg as any).instance_of
                  ? 'A booking’s own copy of a package has no public link.'
                  : 'Only an active package can be booked. Change its status to share a link.'}
            </p>
          </div>
          {pkg.status === 'active' && !(pkg as any).instance_of && (
            <StorefrontLink slug={org.slug} path={`/book/${org.slug}/${pkg.id}`} />
          )}
        </section>
      )}

      <section className="q-print-part">
        <div className="q-print-part-head">
          <h2 className="q-print-part-title">What is in it</h2>
          <p className="q-print-part-note">
            {services.length === 0
              ? 'No services bundled.'
              : 'What this package is built from. Everything it promises, is classified as, fixes and involves is said of one of these.'}
          </p>
        </div>
        <div>
          {services.length > 0 && (
            <>

              <div className="q-stack q-stack-sm">
                {services.map((s: any) => {
                  /*
                   * ONE SERVICE, EVERYTHING SAID ABOUT IT.
                   *
                   * Deliverables, classifications, variables and tasks were four
                   * sections, each looping over the same bundle and heading every
                   * block with the same service name. Three bundled services made
                   * twelve blocks in four places, and reading what one of them
                   * actually amounts to meant assembling it from four passes down
                   * the page. Everything a package says, it says about one of its
                   * services, so the service is the unit here as it is in the
                   * editor — same grouping, same order, so the two agree.
                   *
                   * OPEN BY DEFAULT, unlike the editor. There you are working on
                   * one service at a time and the others are in the way; here you
                   * came to read what the package is, and folding that away by
                   * default would be hiding the page from its own reader. The
                   * disclosure is for tidying a long bundle, not for guarding it.
                   *
                   * Plain <details>, so this stays a server component and folds
                   * with no JavaScript at all.
                   */
                  const promised = s.deliverables || [];
                  /* fixed was every row here too, so a variable left to the
                     client came out twice: blank in the offer above, and again
                     as a question below. */
                  const { fixed, asked, undecided } = splitVariables(
                    s.variableValues || [], s.variables || []);
                  /*
                   * Three states, not two.
                   *
                   * Fixed is part of the offer. Left to the client is a question
                   * asked at booking. Undecided is neither — and it used to be
                   * lumped in with the second, which is how a variable nobody
                   * had thought about became a question on a public booking form
                   * without anyone choosing to ask it.
                   */
                  const open = [...asked, ...undecided];
                  const tasks = s.tasks || [];

                  return (
                    <details key={s.id} className="q-details q-part" open>
                      <summary className="q-disclosure">
                        <span className="q-disclosure-mark" aria-hidden="true" />
                        <span>
                          <span className="q-strong">{s.name}</span>{' '}
                          <span className="q-meta-sm">{s.domain?.name || 'No domain'}</span>
                        </span>
                      </summary>

                      <div className="q-stack q-stack-lg q-tile-sub">
                        <div className="q-stack q-stack-sm">
                          <h3 className="q-eyebrow">Deliverables</h3>
                          {promised.length === 0 ? (
                            <p className="q-text-meta">Nothing promised from this service.</p>
                          ) : (
                            <div className="q-grid-cards">
                              {promised.map((d: any) => (
                                <div key={d.id} className="q-tile">
                                  <div><Counted text={formatDeliverable(d)} small /></div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="q-stack q-stack-sm">
                          <h3 className="q-eyebrow">Classifications</h3>
                          <ClassificationsFor service={s} />
                        </div>

                        <div className="q-stack q-stack-sm">
                          <h3 className="q-eyebrow">Variables</h3>
                          {/*
                            * Both halves. A variable left open is not an absence
                            * — it is a question the client answers at booking,
                            * and which of the two a variable is is the thing
                            * worth knowing. Only the fixed ones were shown, so a
                            * service whose variables were all open read as having
                            * none.
                            */}
                          {fixed.length === 0 && open.length === 0 ? (
                            <p className="q-text-meta">Nothing varies about this service.</p>
                          ) : (
                            <>
                              {fixed.map((v: any) => (
                                <div key={v.serviceVariableId} className="q-row q-row-between q-tile">
                                  <span className="q-meta-plain">{v.label}</span>
                                  <span className="q-strong">{formatVariableValue(v)}</span>
                                </div>
                              ))}
                              {asked.map((v: any) => (
                                <div key={v.id} className="q-row q-row-between q-tile">
                                  <span className="q-meta-plain">{v.label}</span>
                                  <span className="q-meta">The client chooses</span>
                                </div>
                              ))}
                              {undecided.map((v: any) => (
                                <div key={v.id} className="q-row q-row-between q-tile">
                                  <span className="q-meta-plain">{v.label}</span>
                                  {/* Not a question. Nobody has said what happens
                                      to this one, so it is asked of no one and the
                                      package is unfinished until somebody says. */}
                                  <span className="q-meta q-absent">Not decided</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>

                        <div className="q-stack q-stack-sm">
                          <h3 className="q-eyebrow">Tasks</h3>
                          {s.workflow?.name && <span className="q-meta-sm">{s.workflow.name}</span>}
                          {tasks.length === 0 ? (
                            <p className="q-text-meta">
                              No workflow defines how {s.name} is produced and this package adds no step of
                              its own, so a booking of it produces no work here and nobody can be assigned.
                            </p>
                          ) : tasks.map((t: any) => (
                            <div key={t.id} className="q-row q-row-between q-tile">
                              <span className={t.isActive ? 'q-text-body' : 'q-text-struck'}>{t.name}</span>
                              <div className="q-row q-row-sm">
                                {/* A step this package added rather than
                                    inherited. It will not be rewritten when the
                                    service workflow changes, which is worth
                                    seeing. */}
                                {!t.workflowTaskId && <span className="q-meta-sm">This package only</span>}
                                {t.roleName && <span className="q-badge q-badge-neutral">{t.roleName}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

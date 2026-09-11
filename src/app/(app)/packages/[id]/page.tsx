import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { CoverSlides } from '@/components/CoverSlides';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatDeliverable, getPackage } from '@/modules/packages/interface';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { formatVariableValue, splitVariables } from '@/modules/services/interface';
import { ClassificationsFor } from './Classifications';
import { Counted } from '@/components/Counted';
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

  const [currencyCode, org] = await Promise.all([
    getStudioCurrency(),
    getStudio(),
  ]);

  const services = (pkg as any).services || [];

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/packages">&larr; Back to Packages</Link>

      {/*
        * The work, before the words about it — and present either way.
        *
        * Drawn only when a cover existed, this page gave no sign that a package
        * could have one, so the only way to find out was to open the editor and
        * scroll. Empty it is the same wash the card uses, and it says what it
        * is for.
        */}
      {/* The whole set, playing. The banner is the biggest a package's own
          pictures are ever drawn for the studio that took them. */}
      <CoverSlides
        slides={(pkg as any).images || []}
        /* The frame is the banner: it has the shape, the radius and the border,
           and the slides fill it. The link inside is only a click surface — it
           paints nothing, or it would sit on top of the very pictures it opens. */
        className={((pkg as any).images || []).length ? 'q-cover-banner' : 'q-cover-banner q-cover-empty'}
      >
        <Link
          href={`/packages/${pkg.id}/edit`}
          className="q-cover-banner-link q-plain-link"
          title={((pkg as any).images || []).length ? 'Change the pictures' : 'Add a picture'}
        >
          {!((pkg as any).images || []).length && <span className="q-meta-sm">Add a picture</span>}
        </Link>
      </CoverSlides>

      {/*
        * THE PRINT'S HEAD.                                       (D1, D2, D4)
        *
        * This was a page header - name, a status badge, and a subtitle reading
        * "What the client buys, and what it costs", which describes the page
        * rather than the package - followed by the description, a Booking-link
        * card, a Commercial-terms card and a Deliverables card. Four cards
        * before the reader reached what the package is made of.
        *
        * A print is one thing, captioned. The photograph above; the bundle as
        * a stamp; the name at the size of a name; then the facts on hairlines:
        * what the client receives, the price, what it is for, what it fixes,
        * the work. The Commercial-terms and Deliverables cards are those facts
        * and nothing else, so they are gone as cards and present as lines.
        *
        * The status is said only when it is worth saying - "active" on every
        * package is a badge that means nothing.
        */}
      {(() => {
        const bundle = services.map((s: any) => s.name).join(' + ');
        const promised = services.flatMap((s: any) => s.deliverables || []);
        const priced = pkg.price?.amount != null;
        const retired = pkg.status === 'retired';
        const instance = Boolean((pkg as any).instance_of);

        /*
         * What the package is FOR, collated across the bundle. The rule is the
         * one Classifications.tsx states: a service that narrows nothing is
         * classified as it is classified everywhere. Values are merged by
         * question so a package of two services answering the same question
         * lists that question once.
         */
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

        /* What it fixes: the settled variables, across the bundle. */
        const { fixed } = splitVariables(
          services.flatMap((s: any) => s.variableValues || []),
          services.flatMap((s: any) => s.variables || []),
        );

        /* The work: how many steps, and which roles they need. */
        const steps = services.flatMap((s: any) => s.tasks || []);
        const roles = [...new Set(steps.map((x: any) => x.roleName).filter(Boolean))] as string[];

        const SHOW = 3;

        return (
          <>
            <div className="q-print-head">
              <div>
                {bundle && <span className="q-print-stamp">{bundle}</span>}
                <h1 className="q-print-name">{pkg.name}</h1>
              </div>
              <div className="q-row">
                {(retired || instance) && (
                  <span className="q-badge q-badge-neutral">{instance ? 'Booking copy' : 'Retired'}</span>
                )}
                {/*
                  * BOOK, WHERE THE PACKAGE IS. Primary and left of Edit: a
                  * catalogue exists to take bookings. Withdrawn and borrowed
                  * packages do not offer it - a studio that stopped selling
                  * something should not be invited to sell it, and an instance
                  * is a booking's private copy.
                  */}
                {!retired && !instance && (
                  <Link href={`/bookings/new?package=${pkg.id}`} className="q-btn q-btn-primary" title={`Take a booking for ${pkg.name}`}>
                    Book
                  </Link>
                )}
                <Link href={`/packages/${pkg.id}/edit`} className="q-btn q-btn-secondary">Edit package</Link>
              </div>
            </div>

            <div className="q-print-facts">
              <div className="q-print-fact">
                <span className="q-print-key">Client receives</span>
                <span className="q-print-val">
                  {promised.length > 0
                    ? promised.map((d: any, i: number) => (
                        <span key={d.id ?? i}>{i > 0 && ' \u00b7 '}<Counted text={formatDeliverable(d)} /></span>
                      ))
                    : <span className="q-absent">Nothing promised yet</span>}
                </span>
              </div>
              <div className="q-print-fact">
                <span className="q-print-key">Price</span>
                <span className="q-print-val">
                  {priced
                    ? <span className="q-print-fig">{formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))}</span>
                    : <span className="q-absent">Not priced</span>}
                  {pkg.duration_minutes != null && <span className="q-print-more">{pkg.duration_minutes} min</span>}
                </span>
              </div>
              {questions.map((q) => {
                const names = [...q.values.values()];
                return (
                  <div key={q.name} className="q-print-fact">
                    <span className="q-print-key">{q.name}</span>
                    <span className="q-print-val">
                      {names.slice(0, SHOW).join(', ')}
                      {names.length > SHOW && <span className="q-print-more">+{names.length - SHOW}</span>}
                    </span>
                  </div>
                );
              })}
              {fixed.map((v: any) => (
                <div key={v.serviceVariableId} className="q-print-fact">
                  <span className="q-print-key">{v.label ?? v.name}</span>
                  <span className="q-print-val">{formatVariableValue(v)}</span>
                </div>
              ))}
              <div className="q-print-fact">
                <span className="q-print-key">Work</span>
                <span className="q-print-val">
                  {steps.length > 0
                    ? <>{steps.length} {steps.length === 1 ? 'step' : 'steps'}{roles.length > 0 && <>{' · needs '}{roles.join(', ')}</>}</>
                    : <span className="q-absent">No work defined</span>}
                </span>
              </div>
            </div>
          </>
        );
      })()}

      {pkg.description && (
        <p className="q-text-body" style={{ marginBottom: '24px', fontSize: '1.05rem', color: 'var(--q-color-ink-700)' }}>
          {pkg.description}
        </p>
      )}

      {/*
        * THE LINK FOR THIS ONE PACKAGE, below the facts: what the package is
        * comes before how to hand it out. Shown only when the link would work -
        * getPackagePublic requires status active, so offering it on a retired
        * package or a booking's own instance would hand somebody a link that
        * 404s in front of their client.
        */}
      {org?.slug && (
        <div className="q-card q-section" style={{ marginBottom: '24px' }}>
          <h2 className="q-section-title">Booking link</h2>
          {pkg.status === 'active' && !(pkg as any).instance_of ? (
            <>
              <p className="q-meta" style={{ margin: '4px 0 12px' }}>
                Send this to a client to book this package.
              </p>
              <StorefrontLink slug={org.slug} path={`/book/${org.slug}/${pkg.id}`} />
            </>
          ) : (
            <p className="q-meta" style={{ margin: '4px 0 0' }}>
              {(pkg as any).instance_of
                ? 'This is a booking\u2019s own copy of a package, not a catalogue one, so it has no public link.'
                : 'Only an active package can be booked. Change its status to share a link.'}
            </p>
          )}
        </div>
      )}

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section q-rise">
          <h2 className="q-section-title">Services</h2>
          {services.length === 0 ? (
            <p className="q-text-meta">No services bundled.</p>
          ) : (
            <>
              <p className="q-meta" style={{ marginBottom: '16px' }}>
                What this package is built from. Everything it promises, is classified as, fixes and
                involves is said of one of these.
              </p>

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
                    <details key={s.id} className="q-details q-tile" open>
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

      </div>
    </div>
  );
}

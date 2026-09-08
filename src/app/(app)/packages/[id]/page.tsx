import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
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
      <Link
        href={`/packages/${pkg.id}/edit`}
        className={(pkg as any).cover_url ? 'q-cover-banner q-plain-link' : 'q-cover-banner q-cover-empty q-plain-link'}
        style={(pkg as any).cover_url
          ? {
              backgroundImage: `url(${(pkg as any).cover_url})`,
              backgroundPosition: (pkg as any).cover_position || undefined,
            }
          : undefined}
        title={(pkg as any).cover_url ? 'Change the cover' : 'Add a cover'}
      >
        {!(pkg as any).cover_url && <span className="q-meta-sm">Add a cover</span>}
      </Link>

      <header className="q-page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="q-row" style={{ alignItems: 'center', gap: '12px' }}>
            <h1 className="q-page-title">{pkg.name}</h1>
            <span className={`q-badge ${pkg.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
              {pkg.status}
            </span>
          </div>
          <p className="q-page-subtitle" style={{ marginTop: '4px' }}>
            What the client buys, and what it costs.
          </p>
        </div>
        <div className="q-row">
          {/*
            * BOOK, WHERE THE PACKAGE IS.
            *
            * The catalogue card has had this since the grid was built, and the
            * page you land on by clicking that card did not — so an operator
            * who opened a package to check what was in it before selling it
            * had to go back to the grid to sell it.
            *
            * Primary, and to the left of Edit, for the reason the card gives:
            * a catalogue exists to take bookings, so this is the confident
            * action and editing is the quiet one.
            *
            * WITHDRAWN AND BORROWED PACKAGES DO NOT OFFER IT. Retired is the
            * card's own rule — a studio that stopped selling something should
            * not be invited to sell it. An instance is a booking's private
            * copy, so "book this" would mean booking a copy of a booking; it
            * is the same guard the public link below uses, for the same
            * reason, and this page is the one place both can be reached.
            */}
          {pkg.status !== 'retired' && !(pkg as any).instance_of && (
            <Link
              href={`/bookings/new?package=${pkg.id}`}
              className="q-btn q-btn-primary"
              title={`Take a booking for ${pkg.name}`}
            >
              Book
            </Link>
          )}
          <Link href={`/packages/${pkg.id}/edit`} className="q-btn q-btn-secondary">
            Edit package
          </Link>
        </div>
      </header>

      {pkg.description && (
        <p className="q-text-body" style={{ marginBottom: '24px', fontSize: '1.05rem', color: 'var(--q-color-ink-700)' }}>
          {pkg.description}
        </p>
      )}

      {/*
        * THE LINK FOR THIS ONE PACKAGE.
        *
        * The studio could hand out its whole catalogue and it could hand out
        * the open enquiry form, and there was no way to hand out ONE package —
        * which is the commonest case of all. An operator agrees a package with
        * a client over the phone and wants to send them that package, with its
        * price and its promise, and a button to book it. The page has existed
        * the whole time at /book/[slug]/[id]; nothing in the app would tell you
        * its address.
        *
        * SHOWN ONLY WHEN THE LINK WOULD ACTUALLY WORK. getPackagePublic
        * requires status 'active', so offering this on a retired package — or
        * on a booking's own instance, which is 'custom' — would hand somebody a
        * link that 404s in front of their client. Better to say why there is no
        * link than to give out a broken one.
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
                ? 'This is a booking’s own copy of a package, not a catalogue one, so it has no public link.'
                : 'Only an active package can be booked. Change its status to share a link.'}
            </p>
          )}
        </div>
      )}

      <div className="q-stack q-stack-lg">
        <div className="q-card q-section q-rise">
          <h2 className="q-section-title">Commercial terms</h2>
          <div className="q-grid-halves" style={{ marginTop: '16px' }}>
            <div>
              <span className="q-meta-sm" style={{ display: 'block', marginBottom: '4px' }}>Base Price</span>
              <div className="q-stat-value">
                {pkg.price?.amount != null
                  ? formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))
                  : 'Unpriced'}
              </div>
            </div>
            {pkg.duration_minutes != null && (
              <div>
                <span className="q-meta-sm" style={{ display: 'block', marginBottom: '4px' }}>Expected Duration</span>
                <div className="q-text-body">{pkg.duration_minutes} minutes</div>
              </div>
            )}
          </div>
        </div>

        {/*
          * EVERYTHING THIS PACKAGE PROMISES, IN ONE PLACE.
          *
          * Deliverables hang off each bundled service, so folding them into the
          * services was structurally honest — and it left a package bundling
          * three services with its promise scattered across three folds, two of
          * them shut. Nobody buys a service; they buy the package, and what
          * arrives is the whole of it.
          *
          * So the collated promise is a section of its own and the per-service
          * lists stay where they are. They are two different questions: this
          * one is what the client receives, the one inside each service is which
          * part of the work produces it. The first belongs to the package, and
          * it is what the invoice bills and the storefront advertises.
          *
          * Which service produced what is said only where there is more than
          * one, for the same reason it always is here.
          */}
        <div className="q-card q-section q-rise">
          <h2 className="q-section-title">Deliverables</h2>
          {(() => {
            const promised = services.flatMap((s: any) =>
              (s.deliverables || []).map((d: any) => ({ d, from: s.name })));

            if (promised.length === 0) {
              return (
                <p className="q-text-meta">
                  Nothing promised yet. A package with no deliverables is a price with nothing
                  attached to it.
                </p>
              );
            }

            return (
              <div className="q-stack q-stack-sm">
                {promised.map(({ d, from }: any, i: number) => (
                  <div key={`${from}-${d.id}-${i}`} className="q-row q-row-between q-tile">
                    <span className="q-text-body"><Counted text={formatDeliverable(d)} /></span>
                    {services.length > 1 && <span className="q-meta-sm">{from}</span>}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

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

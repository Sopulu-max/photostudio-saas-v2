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

  const [currencyCode, org, bookedOn] = await Promise.all([
    getStudioCurrency(),
    getStudio(),
    /* Where this package has been booked: derived from the lines that
       instance it. A catalogue package is never on a booking itself. */
    (pkg as any).instance_of ? Promise.resolve([]) : listBookingsOfPackage(pkg.id),
  ]);

  const services = (pkg as any).services || [];

  /* ── what the page says, computed once ─────────────────────────────── */
  const bundle = services.map((s: any) => s.name).join(' + ');
  const promised = services.flatMap((s: any) => s.deliverables || []) as any[];
  const priced = pkg.price?.amount != null;
  const retired = pkg.status === 'retired';
  const instance = Boolean((pkg as any).instance_of);
  const images = ((pkg as any).images || []) as any[];

  /*
   * What it is FOR, collated across the bundle by the rule Classifications
   * states: a service that narrows nothing is classified as it is everywhere.
   * Values merged by question, questions in the studio's own order.
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
  const { fixed } = splitVariables(
    services.flatMap((s: any) => s.variableValues || []),
    services.flatMap((s: any) => s.variables || []),
  );

  /* A deliverable, split into the number and the thing, for the stat band. */
  const asStat = (d: any) => {
    const text = formatDeliverable(d);
    const m = text.match(/^(\d[\d,.]*)\s+(.*)$/);
    return m ? { num: m[1], label: m[2] } : { num: null, label: text };
  };

  const shortDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="q-print-page">
      <Link className="q-back" href="/packages">&larr; Packages</Link>

      {/*
        * THE HERO. The photograph, edge to edge, and nothing on it. The name
        * comes after at its own size - stacking a label on the picture made
        * both smaller than they are.
        */}
      <div className="q-print-hero">
        {images.length > 0
          ? <CoverSlides slides={images} className="q-slides" />
          : <Link href={`/packages/${pkg.id}/edit`} className="q-print-hero-empty q-plain-link">Add a picture</Link>}
      </div>

      <div className="q-print-title">
        {bundle && <span className="q-print-stamp">{bundle}</span>}
        <div className="q-row" style={{ alignItems: 'center', gap: '14px' }}>
          <h1 className="q-print-display">{pkg.name}</h1>
          {(retired || instance) && (
            <span className="q-badge q-badge-neutral">{instance ? 'Booking copy' : 'Retired'}</span>
          )}
        </div>
        {pkg.description && <p className="q-print-lede-text">{pkg.description}</p>}

        <div className="q-print-cta">
          {/* Book leads: a catalogue exists to take bookings. Withdrawn and
              borrowed packages do not offer it, for the reasons the card
              gives. The link is here too, because "send this to a client"
              is the second thing a studio does from this page. */}
          {!retired && !instance && (
            <Link href={`/bookings/new?package=${pkg.id}`} className="q-btn q-btn-primary" title={`Take a booking for ${pkg.name}`}>Book</Link>
          )}
          <Link href={`/packages/${pkg.id}/edit`} className="q-btn q-btn-secondary">Edit package</Link>
        </div>
      </div>

      {/*
        * THE STAT BAND. This much, for this, and this. The price and every
        * thing the client receives as numerals with their names beneath,
        * read left to right as one sentence. They are the whole offer, so
        * they are the largest figures on the page after the name.
        */}
      <div className="q-print-stats">
        <div className="q-print-stat q-print-stat-price">
          <span className="q-print-stat-num mono">
            {priced
              ? <>{formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))}
                  {(pkg as any).price_unit && <span className="q-print-price-unit">/{(pkg as any).price_unit}</span>}</>
              : <span className="q-absent" style={{ fontSize: '0.5em', fontFamily: 'var(--q-font-sans)', fontWeight: 400 }}>Not priced</span>}
          </span>
          <span className="q-print-stat-label">Price</span>
        </div>

        {/* The promise as a set: one counted item per deliverable, in a grid
            that wraps as cleanly at ten as at two. An item with no count is
            named where its number would be. */}
        <div className="q-print-stat-set">
          {promised.map((d: any, i: number) => {
            const { num, label } = asStat(d);
            return (
              <div key={d.id ?? i} className="q-print-stat">
                {num
                  ? <><span className="q-print-stat-num">{num}</span><span className="q-print-stat-label">{label}</span></>
                  : <><span className="q-print-stat-word">{label}</span><span className="q-print-stat-label">Included</span></>}
              </div>
            );
          })}
          {promised.length === 0 && (
            <div className="q-print-stat">
              <span className="q-print-stat-word q-absent" style={{ fontWeight: 400 }}>Nothing promised yet</span>
              <span className="q-print-stat-label">Client receives</span>
            </div>
          )}
          {pkg.duration_minutes != null && (
            <div className="q-print-stat">
              <span className="q-print-stat-num">{pkg.duration_minutes}</span>
              <span className="q-print-stat-label">Minutes</span>
            </div>
          )}
        </div>
      </div>

      {/* WHAT IT IS FOR. Each question a row; its answers as words with air
          between them. The whole list, because this is the page for it. */}
      {(questions.length > 0 || fixed.length > 0) && (
        <section className="q-print-chapter">
          <div className="q-print-chapter-head">
            <h2 className="q-print-chapter-title">What it{'’'}s for</h2>
            <p className="q-print-chapter-note">How this package is classified, and what it fixes for every booking.</p>
          </div>
          <div className="q-print-facts q-print-for">
            {questions.map((q) => (
              <div key={q.name} className="q-print-fact">
                <span className="q-print-key">{q.name}</span>
                <span className="q-print-val">
                  {[...q.values.values()].map((v, i) => (
                    /* Spaces on both sides of the dot, not only margins: a
                       margin is not a break opportunity, and a line of
                       occasions with none could not wrap. */
                    <span key={v}>{i > 0 && <>{' '}<span className="q-print-for-sep">·</span>{' '}</>}{v}</span>
                  ))}
                </span>
              </div>
            ))}
            {fixed.map((v: any) => (
              <div key={v.serviceVariableId} className="q-print-fact">
                <span className="q-print-key">{v.label ?? v.name}</span>
                <span className="q-print-val">{formatVariableValue(v)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/*
        * WHAT IS IN IT. The services as objects - each has a page of its own,
        * so each is a card, the one place on this page a card is right (D7).
        * Its promise, its classification and its work as compact lines; the
        * full account is one click away on the service.
        */}
      <section className="q-print-chapter">
        <div className="q-print-chapter-head">
          <h2 className="q-print-chapter-title">What{'’'}s in it</h2>
          <p className="q-print-chapter-note">
            {services.length === 0
              ? 'No services bundled.'
              : `${services.length} ${services.length === 1 ? 'service' : 'services'}. Everything this package promises, is classified as, fixes and involves is said of one of these.`}
          </p>
        </div>
        {services.length > 0 && (
          <div className="q-print-services">
            {services.map((s: any) => {
              const promise = (s.deliverables || []).map((d: any) => formatDeliverable(d));
              const narrowed = s.narrowedTo || [];
              const tags = (narrowed.length ? narrowed : (s.dimensions || [])) as any[];
              const forWhat = tags.flatMap((d: any) => (d.values || []).map((v: any) => v.name));
              const { fixed: sFixed, asked, undecided } = splitVariables(s.variableValues || [], s.variables || []);
              const tasks = (s.tasks || []) as any[];
              const roles = [...new Set(tasks.map((x) => x.roleName).filter(Boolean))] as string[];
              return (
                <Link key={s.id} href={`/services/${s.id}`} className="q-print-service">
                  <div>
                    <span className="q-print-stamp" style={{ marginBottom: 6 }}>{s.domain?.name || 'No domain'}</span>
                    <h3 className="q-print-service-name">{s.name}</h3>
                  </div>
                  <div className="q-print-service-lines">
                    <div className="q-print-service-line">
                      <span className="q-print-key">Produces</span>
                      <span>{promise.length ? promise.map((x: string, i: number) => <span key={i}>{i > 0 && ' · '}<Counted text={x} /></span>) : <span className="q-absent">Nothing yet</span>}</span>
                    </div>
                    <div className="q-print-service-line">
                      <span className="q-print-key">For</span>
                      <span>{forWhat.length ? forWhat.join(', ') : <span className="q-absent">Not classified</span>}</span>
                    </div>
                    {(sFixed.length > 0 || asked.length > 0 || undecided.length > 0) && (
                      <div className="q-print-service-line">
                        <span className="q-print-key">Settles</span>
                        <span>
                          {sFixed.map((v: any) => `${v.label}: ${formatVariableValue(v)}`).join(' · ')}
                          {asked.length > 0 && <span className="q-meta-sm">{sFixed.length > 0 ? ' · ' : ''}{asked.length} asked at booking</span>}
                          {undecided.length > 0 && <span className="q-meta-sm q-absent">{(sFixed.length > 0 || asked.length > 0) ? ' · ' : ''}{undecided.length} undecided</span>}
                        </span>
                      </div>
                    )}
                    <div className="q-print-service-line">
                      <span className="q-print-key">Work</span>
                      <span>{tasks.length
                        ? <>{tasks.length} {tasks.length === 1 ? 'step' : 'steps'}{roles.length > 0 && <span className="q-meta-sm"> · {roles.join(', ')}</span>}</>
                        : <span className="q-absent">No workflow</span>}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/*
        * WHERE IT HAS BEEN BOOKED. The question a studio brings to a package:
        * is it selling. A booking never points at the catalogue package, only
        * at its own copy, so this is the copies read back to their origin
        * through instance_of. A borrowed package is a copy and has none.
        */}
      {!instance && (
        <section className="q-print-chapter">
          <div className="q-print-chapter-head">
            <h2 className="q-print-chapter-title">
              Where it{'’'}s been booked
              {bookedOn.length > 0 && <span className="q-print-stat-label" style={{ marginLeft: 14 }}>{bookedOn.length}</span>}
            </h2>
            <p className="q-print-chapter-note">{bookedOn.length === 0 ? 'Not yet.' : 'Newest first.'}</p>
          </div>
          {bookedOn.length > 0 && (
            <div className="q-sheet">
              {bookedOn.slice(0, 8).map((b) => (
                <SheetRow key={b.lineId} item={{
                  id: b.lineId,
                  href: `/bookings/${b.id}`,
                  name: b.title,
                  caption: [shortDate(b.scheduledFor), b.clientName],
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
        * a studio hands out. At the foot rather than beside Book: a URL box is
        * a tool, not a moment, and the hero is for the moment. Shown only when
        * the link would work - getPackagePublic requires status active.
        */}
      {org?.slug && !instance && (
        <section className="q-print-chapter">
          <div className="q-print-chapter-head">
            <h2 className="q-print-chapter-title">How it{'’'}s sold</h2>
            <p className="q-print-chapter-note">
              {pkg.status === 'active'
                ? 'Send this to a client to book this package.'
                : 'Only an active package can be booked. Change its status to share a link.'}
            </p>
          </div>
          {pkg.status === 'active' && <StorefrontLink slug={org.slug} path={`/book/${org.slug}/${pkg.id}`} />}
        </section>
      )}

      {/* A borrowed package says so, in place of the link it does not have. */}
      {instance && (
        <section className="q-print-chapter">
          <p className="q-print-chapter-note">A booking{'’'}s own copy of a package. It has no public link and no bookings of its own.</p>
        </section>
      )}
    </div>
  );
}

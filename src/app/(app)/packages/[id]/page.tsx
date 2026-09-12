import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { CoverSlides } from '@/components/CoverSlides';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { formatDeliverable, getPackage, listPackages } from '@/modules/packages/interface';
import { listBookingsOfPackage } from '@/modules/bookings/interface';
import { stageBadgeClass } from '@/components/stageBadge';
import { SheetRow, initialsFor } from '@/components/Sheet';
import { getStudio, getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { formatVariableValue, splitVariables } from '@/modules/services/interface';
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

  const isFamily = Boolean((pkg as any).isFamily);
  const family = (pkg as any).family as { id: string; name: string } | null;
  const [currencyCode, org, bookedOn, members] = await Promise.all([
    getStudioCurrency(),
    getStudio(),
    /* Where this package has been booked: derived from the lines that
       instance it. A catalogue package is never on a booking itself. */
    (pkg as any).instance_of ? Promise.resolve([]) : listBookingsOfPackage(pkg.id),
    /* A family's members: packages whose member_of is this one. Each reads
       as the family with its own answers, so they list like any package. */
    isFamily ? listPackages().then((all: any[]) => all.filter((m) => m.memberOf === pkg.id)) : Promise.resolve([] as any[]),
  ]);

  const services = (pkg as any).services || [];

  /* ── what the page says, computed once ─────────────────────────────── */
  /* The domains, not the services: the services are a section of their own
     below, and a stamp that names them again is the same fact twice. */
  const bundle = [...new Set(services.map((s: any) => s.domain?.name).filter(Boolean))].join(' + ');
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
        {(bundle || family || isFamily) && (
          <span className="q-print-stamp">
            {family && <><Link href={`/packages/${family.id}`} className="q-plain-link">Member of {family.name}</Link>{bundle && ' · '}</>}
            {isFamily && <>Family{bundle && ' · '}</>}
            {bundle}
          </span>
        )}
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
          {isFamily
            ? <Link href={`/packages/${pkg.id}/members/new`} className="q-btn q-btn-primary">New member</Link>
            : (!retired && !instance && (
              <Link href={`/bookings/new?package=${pkg.id}`} className="q-btn q-btn-primary" title={`Take a booking for ${pkg.name}`}>Book</Link>
            ))}
          <Link href={`/packages/${pkg.id}/edit`} className="q-btn q-btn-secondary">{family ? 'Edit member' : isFamily ? 'Edit family' : 'Edit package'}</Link>
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
          {services.flatMap((s: any) => ((s.deliverables || []) as any[]).map((d) => ({ d, from: s.name }))).map(({ d, from }: { d: any; from: string }, i: number) => {
            const { num, label } = asStat(d);
            const many = services.length > 1;
            return (
              <div key={d.id ?? i} className="q-print-stat">
                {d.decidedBy === 'member'
                  ? <><span className="q-print-stat-word">{label}</span><span className="q-print-stat-label">Member decides{many && <span className="q-print-from">{from}</span>}</span></>
                  : num
                  ? <><span className="q-print-stat-num">{num}</span><span className="q-print-stat-label">{label}{many && <span className="q-print-from">{from}</span>}</span></>
                  : <><span className="q-print-stat-word">{label}</span><span className="q-print-stat-label">Included{many && <span className="q-print-from">{from}</span>}</span></>}
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

      {/*
        * ONE SECTION PER KIND OF INFORMATION, THE SOURCE AS AN ATTRIBUTE.
        *
        * The page was organised by source: the collated facts, and then one
        * card per service re-slicing the same facts. "20 Edited photographs"
        * was on the page twice and "Outdoor" three times, and a service that
        * contributed nothing to a kind was invisible because nothing listed
        * the kinds per source.
        *
        * Now each kind is in one place - what it is for, what it settles, the
        * work - and every row says which service it comes from, as a stamp,
        * ONLY when the bundle has more than one. A stamp on every row of a
        * one-service package says nothing. What's in it is the bundle itself,
        * with each service's contribution counted, so a zero shows.
        */}
      {(() => {
        const many = services.length > 1;
        const From = ({ name }: { name: string }) => many ? <span className="q-print-from">{name}</span> : null;

        /* Every variable across the bundle, in its three states, with its
           service. splitVariables works per service; the states are then
           read as one list of one kind. */
        type Settled = { key: string; label: string; state: 'fixed' | 'asked' | 'undecided' | 'member'; value: string | null; from: string[] };
        const byVariable = new Map<string, Settled>();
        for (const s of services) {
          /* Left to the member: a family's fourth state, kept apart before
             splitVariables reads the rest as fixed / asked / undecided. */
          const toMember = ((s.variableValues || []) as any[]).filter((v) => v.answeredBy === 'member');
          const rest = ((s.variableValues || []) as any[]).filter((v) => v.answeredBy !== 'member');
          const { fixed: f, asked: a, undecided: u } = splitVariables(rest, (s.variables || []).filter((v: any) => !toMember.some((m) => m.serviceVariableId === v.id)));
          const put = (id: string, label: string, state: Settled['state'], value: string | null) => {
            const row = byVariable.get(id) ?? { key: id, label, state, value, from: [] };
            row.from.push(s.name);
            byVariable.set(id, row);
          };
          for (const v of f) put(v.serviceVariableId, v.label, 'fixed', formatVariableValue(v));
          for (const v of a) put(v.id, v.label, 'asked', null);
          for (const v of u) put(v.id, v.label, 'undecided', null);
          for (const v of toMember) put(v.serviceVariableId, v.label, 'member', null);
        }
        const settled = [...byVariable.values()];
        const packageWide = (from: string[]) => from.length >= services.length;
        const kept = settled.filter((v) => v.state !== 'asked');
        const asked = settled.filter((v) => v.state === 'asked');
        const nFixed = kept.filter((v) => v.state === 'fixed').length;
        const nUndecided = kept.filter((v) => v.state === 'undecided').length;
        /* A question with one answer is settled; with several it is asked. */
        const settledQuestions = questions.filter((q) => q.values.size === 1);
        const openQuestions = questions.filter((q) => q.values.size > 1);
        const formFields = ((pkg as any).form_schema || []) as any[];
        const nAsked = openQuestions.length + asked.length + formFields.length;

        /* The work, in the order it runs, with where each step came from. */
        const work: any[] = services.flatMap((s: any) =>
          ((s.tasks || []) as any[]).map((x) => ({ ...x, from: s.name })));

        return (
          <>
            {/* A FAMILY'S MEMBERS. Each is the family with its own answers:
                what it settled, at its price. The family itself is not sold. */}
            {isFamily && (
              <section className="q-print-chapter">
                <div className="q-print-chapter-head">
                  <h2 className="q-print-chapter-title">Members</h2>
                  <p className="q-print-chapter-note">{members.length === 0 ? 'None yet' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}</p>
                </div>
                {members.length > 0 && (
                  <div className="q-sheet">
                    {members.map((m: any) => (
                      <SheetRow key={m.id} item={{
                        id: m.id,
                        href: `/packages/${m.id}`,
                        name: m.name,
                        caption: ((m.deliverables || []) as any[]).slice(0, 3).map((d) => formatDeliverable(d)),
                        absent: 'Nothing promised',
                        frame: { url: m.cover_url ?? null, initials: initialsFor(m.name) },
                        figure: m.price?.amount != null
                          ? { text: formatMoney(Number(m.price.amount), String(m.price.currency || currencyCode)) }
                          : { text: 'No price', none: true },
                        action: m.status !== 'retired'
                          ? <Link href={`/bookings/new?package=${m.id}`} className="q-btn q-btn-secondary q-btn-xs">Book</Link>
                          : undefined,
                      }} />
                    ))}
                  </div>
                )}
                <div style={{ marginTop: '12px' }}>
                  <Link href={`/packages/${pkg.id}/members/new`} className="q-btn q-btn-secondary q-btn-sm">New member</Link>
                </div>
              </section>
            )}

            {/* WHAT'S IN IT: the bundle, and what each service brings. */}
            <section className="q-print-chapter">
              <div className="q-print-chapter-head">
                <h2 className="q-print-chapter-title">Services</h2>
                <p className="q-print-chapter-note">
                  {services.length === 0 ? 'None' : `${services.length} ${services.length === 1 ? 'service' : 'services'}`}
                </p>
              </div>
              {services.length > 0 && (
                <div className="q-sheet">
                  {services.map((s: any) => {
                    const { fixed: f, asked: a, undecided: u } = splitVariables(s.variableValues || [], s.variables || []);
                    const nProduce = (s.deliverables || []).length;
                    const narrowed = s.narrowedTo || [];
                    const nFor = ((narrowed.length ? narrowed : (s.dimensions || [])) as any[]).reduce((n, d) => n + (d.values || []).length, 0);
                    const nWork = (s.tasks || []).length;
                    const say = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;
                    return (
                      <SheetRow key={s.id} item={{
                        id: s.id,
                        href: `/services/${s.id}`,
                        name: s.name,
                        caption: [
                          nProduce > 0 ? say(nProduce, 'deliverable', 'deliverables') : null,
                          nFor > 0 ? say(nFor, 'classification', 'classifications') : null,
                          (f.length + a.length + u.length) > 0 ? say(f.length + a.length + u.length, 'variable', 'variables') : null,
                          nWork > 0 ? say(nWork, 'task', 'tasks') : null,
                        ],
                        absent: 'Nothing yet',
                        frame: { url: s.cover_url, initials: (s.name || '?').trim().charAt(0).toUpperCase() },
                        badge: s.domain?.name ? <span className="q-badge q-badge-neutral">{s.domain.name}</span> : undefined,
                      }} />
                    );
                  })}
                </div>
              )}
            </section>

            {/* CLASSIFICATION: what the package has settled - a question with
                one answer. A question still holding several is asked of the
                client, and lives in the booking form below, once. */}
            {settledQuestions.length > 0 && (
              <section className="q-print-chapter">
                <div className="q-print-chapter-head">
                  <h2 className="q-print-chapter-title">Classification</h2>
                  <p className="q-print-chapter-note">{settledQuestions.length} settled</p>
                </div>
                <div className="q-print-facts q-print-for">
                  {settledQuestions.map((q) => (
                    <div key={q.name} className="q-print-fact">
                      <span className="q-print-key">{q.name}</span>
                      <span className="q-print-val">{[...q.values.values()][0]}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* VARIABLES: what the package fixes, and what nobody has decided. */}
            {kept.length > 0 && (
              <section className="q-print-chapter">
                <div className="q-print-chapter-head">
                  <h2 className="q-print-chapter-title">Variables</h2>
                  <p className="q-print-chapter-note">
                    {[
                      nFixed > 0 ? `${nFixed} fixed` : null,
                      nUndecided > 0 ? `${nUndecided} undecided` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="q-print-facts q-print-for">
                  {kept.map((v) => (
                    <div key={v.key} className="q-print-fact">
                      <span className="q-print-key">{v.label}{!packageWide(v.from) && <From name={v.from.join(', ')} />}</span>
                      <span className="q-print-val">
                        {v.state === 'fixed' ? v.value : v.state === 'member' ? 'Member decides' : <span className="q-absent">Undecided</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* BOOKING FORM: everything the client answers, from three
                sources - a classification left open, a variable left open,
                the studio's own questions - in one place, each once. */}
            {nAsked > 0 && (
              <section className="q-print-chapter">
                <div className="q-print-chapter-head">
                  <h2 className="q-print-chapter-title">Booking form</h2>
                  <p className="q-print-chapter-note">{nAsked} {nAsked === 1 ? 'question' : 'questions'}</p>
                </div>
                <div className="q-print-facts q-print-for">
                  {openQuestions.map((q) => (
                    <div key={`q-${q.name}`} className="q-print-fact">
                      <span className="q-print-key">{q.name}</span>
                      <span className="q-print-val">
                        <span className="q-meta">One of</span>{' '}
                        {[...q.values.values()].map((v, i) => (
                          <span key={v}>{i > 0 && <>{' '}<span className="q-print-for-sep">·</span>{' '}</>}{v}</span>
                        ))}
                      </span>
                    </div>
                  ))}
                  {asked.map((v) => (
                    <div key={v.key} className="q-print-fact">
                      <span className="q-print-key">{v.label}{!packageWide(v.from) && <From name={v.from.join(', ')} />}</span>
                      <span className="q-print-val"><span className="q-meta">Free answer</span></span>
                    </div>
                  ))}
                  {formFields.map((f: any) => (
                    <div key={f.id} className="q-print-fact">
                      <span className="q-print-key">{f.label}<span className="q-print-from">Studio question</span></span>
                      <span className="q-print-val">
                        <span className="q-meta">
                          {f.type === 'select' && Array.isArray(f.options)
                            ? `One of ${f.options.join(' · ')}`
                            : f.type === 'textarea' ? 'Free text'
                            : f.type === 'number' ? 'A number'
                            : f.type === 'date' ? 'A date'
                            : 'Free answer'}
                          {f.required ? ' · required' : ''}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* THE WORK: the steps in order, the role each needs, where each
                came from. The band said "5 steps"; this is the five. */}
            <section className="q-print-chapter">
              <div className="q-print-chapter-head">
                <h2 className="q-print-chapter-title">Tasks</h2>
                <p className="q-print-chapter-note">
                  {work.length === 0
                    ? 'No workflow'
                    : `${work.length} ${work.length === 1 ? 'step' : 'steps'}`}
                </p>
              </div>
              {work.length > 0 && (
                <div className="q-print-facts q-print-for">
                  {work.map((x: any, i: number) => (
                    <div key={x.id} className="q-print-fact">
                      <span className="q-print-key">{i + 1}<From name={x.from} /></span>
                      <span className="q-print-val">
                        <span className={x.isActive ? '' : 'q-text-struck'}>{x.name}</span>
                        {x.roleName && <span className="q-print-more">{x.roleName}</span>}
                        {!x.workflowTaskId && <span className="q-print-more">this package only</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        );
      })()}

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
              Bookings
                          </h2>
            <p className="q-print-chapter-note">{bookedOn.length === 0 ? 'None yet' : `${bookedOn.length} · newest first`}</p>
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
            <h2 className="q-print-chapter-title">Booking link</h2>
            <p className="q-print-chapter-note">
              {pkg.status === 'active' ? 'Active' : 'Inactive — no link until the package is active'}
            </p>
          </div>
          {pkg.status === 'active' && <StorefrontLink slug={org.slug} path={`/book/${org.slug}/${pkg.id}`} />}
        </section>
      )}

      {/* A borrowed package says so, in place of the link it does not have. */}
      {instance && (
        <section className="q-print-chapter">
          <p className="q-print-chapter-note">Booking copy — no public link, no bookings of its own.</p>
        </section>
      )}
    </div>
  );
}

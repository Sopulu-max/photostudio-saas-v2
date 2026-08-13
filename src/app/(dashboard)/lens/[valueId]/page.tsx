import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getDimensionValue, getValuePlace, whatCarries, whatCoOccursWith } from '@/modules/services/interface';
import { listBookingsForDimensionValue } from '@/modules/bookings/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { formatMoney } from '@/kernel/currency';
import { Layers, Package as PackageIcon, CalendarCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * One value, read from the other end of the edge.
 *
 * "What does this studio do for Birthdays?" is not a new fact and needed no new
 * table — it is `service ↔ dimension value` traversed backwards. Everything on
 * this page is derived: what carries it, what already sells it, and what tends
 * to come with it.
 *
 * The two exits at the bottom are the point of entering here at all. A studio
 * looking at Birthday usually wants to *do* something about birthdays, and the
 * fork between the two is a real question with a real answer:
 *
 *   same process, framed differently  →  a package
 *   genuinely a different process     →  a new service
 *
 * Both are prefilled from here, so the answer to "what do I do for birthdays"
 * leads directly into doing it rather than into a blank form.
 */
export default async function LensPage(props: { params: Promise<{ valueId: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const value = await getDimensionValue(params.valueId);
  if (!value) notFound();

  const [place, carried, alongside, booked, currency] = await Promise.all([
    getValuePlace(params.valueId),
    whatCarries(params.valueId),
    whatCoOccursWith(params.valueId),
    listBookingsForDimensionValue(params.valueId),
    getStudioCurrency(),
  ]);

  const activeServices = carried.services.filter((s) => s.status !== 'retired');
  const newServiceHref = `/services/new?domain=${encodeURIComponent(value.domainName || '')}`
    + `&dimension=${encodeURIComponent(value.dimensionName)}&value=${encodeURIComponent(value.name)}`;

  return (
    <div className="q-page-narrow">
      <Link className="q-back" href="/lens">&larr; Every angle</Link>

      <header className="q-page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          {/* Selecting backwards into the upper classification: a beach shoot
              is an outdoor shoot, so Outdoor is one step up from here and
              everything below is a part of what it answers. */}
          {place.ancestors.length > 0 && (
            <div className="q-row" style={{ gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {[...place.ancestors].reverse().map((a) => (
                <Link key={a.id} href={`/lens/${a.id}`} className="q-meta-sm q-accent">
                  {a.name} /
                </Link>
              ))}
            </div>
          )}
          <h1 className="q-page-title">{value.name}</h1>
          <p className="q-page-subtitle" style={{ marginTop: '4px' }}>
            {value.dimensionName}
            {value.domainName && <> &middot; {value.domainName}</>}
            {value.question && <> &middot; {value.question}</>}
          </p>
          {place.children.length > 0 && (
            <div className="q-row" style={{ gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span className="q-meta-sm">Kinds of {value.name}:</span>
              {place.children.map((c) => (
                <Link key={c.id} href={`/lens/${c.id}`} className="q-badge q-badge-neutral">{c.name}</Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <section className="q-card q-section">
          <h2 className="q-section-title">What you do for {value.name}</h2>
          {place.children.length > 0 && (
            <p className="q-meta" style={{ marginBottom: '12px' }}>
              Including what sits inside {value.name}. A service filed under one of those is filed
              under this — it never had to be tagged twice, and where a match came from is named.
            </p>
          )}
          {carried.services.length === 0 ? (
            <p className="q-empty">
              No service is filed under {value.name} yet. It is part of {value.domainName || 'this domain'}&rsquo;s
              vocabulary, but nothing has been classified with it.
            </p>
          ) : (
            <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
              {carried.services.map((s) => (
                <Link key={s.id} href={`/services/${s.id}`} className="q-tile q-row q-row-between">
                  <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                    <Layers size={16} opacity={0.5} />
                    <strong className="q-strong">{s.name}</strong>
                    <span className="q-meta-sm">{s.domainName}</span>
                    {s.narrower && <span className="q-badge q-badge-neutral">{s.narrower}</span>}
                  </span>
                  {s.status === 'retired' && <span className="q-badge q-badge-neutral">retired</span>}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">What you already sell for it</h2>
          <p className="q-meta" style={{ marginBottom: '12px' }}>
            A package counts either way — because it says {value.name} itself, or because it bundles
            something that does. The bundle already said so; nobody had to tag it twice.
          </p>
          {carried.packages.length === 0 ? (
            <p className="q-empty">Nothing sold for {value.name} yet.</p>
          ) : (
            <div className="q-stack q-stack-sm">
              {carried.packages.map((p) => (
                <Link key={p.id} href={`/packages/${p.id}`} className="q-tile q-row q-row-between">
                  <span className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                    <PackageIcon size={16} opacity={0.5} />
                    <strong className="q-strong">{p.name}</strong>
                    {p.via === 'bundled' && p.through && p.through.length > 0 && (
                      <span className="q-meta-sm">via {p.through.join(', ')}</span>
                    )}
                    {p.narrower && <span className="q-badge q-badge-neutral">{p.narrower}</span>}
                  </span>
                  {p.status === 'retired' && <span className="q-badge q-badge-neutral">retired</span>}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/*
          * The catalogue meeting real work. Every other section on this page
          * describes what the studio COULD do; this one is what it actually
          * took on, and it needed no new fact — a line points at a package,
          * a package carries values, and that was already the whole chain.
          */}
        <section className="q-card q-section">
          <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
            <h2 className="q-section-title">What you&rsquo;ve actually booked</h2>
            {booked.total > 0 && (
              <span className="q-num q-strong">{formatMoney(booked.total, currency)}</span>
            )}
          </div>
          {booked.bookings.length === 0 ? (
            <p className="q-empty">
              Nothing booked under {value.name} yet — what you can do for it is above.
            </p>
          ) : (
            <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
              {booked.bookings.map((b) => (
                <Link key={b.id} href={`/bookings/${b.id}`} className="q-tile q-row q-row-between">
                  <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <CalendarCheck size={16} opacity={0.5} />
                    <strong className="q-strong">{b.title}</strong>
                    {b.clientName && <span className="q-meta-sm">{b.clientName}</span>}
                    {b.scheduledFor && (
                      <span className="q-meta-sm">
                        {new Date(b.scheduledFor).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </span>
                  {b.total > 0 && <span className="q-num">{formatMoney(b.total, currency)}</span>}
                </Link>
              ))}
            </div>
          )}
          <p className="q-meta-sm" style={{ marginTop: '12px', opacity: 0.7 }}>
            Read live from how you classify things today. Renaming {value.name} re-reads every booking
            above; moving a package to a different classification moves its history with it.
          </p>
        </section>

        <section className="q-card q-section">
          <h2 className="q-section-title">What goes with it</h2>
          <p className="q-meta" style={{ marginBottom: '12px' }}>
            Derived, not declared. {value.name} relates to these because your own services carry both —
            no one typed the relationship anywhere, and nothing stores it.
          </p>
          {alongside.length === 0 ? (
            <p className="q-empty">
              Nothing yet. Tag a second thing about a {value.name} service and the connection appears here
              on its own.
            </p>
          ) : (
            <div className="q-stack q-stack-sm">
              {Object.entries(
                alongside.reduce<Record<string, typeof alongside>>((acc, c) => {
                  (acc[c.dimensionName] ||= []).push(c);
                  return acc;
                }, {})
              ).map(([dimensionName, values]) => (
                <div key={dimensionName} className="q-tile q-stack q-stack-sm">
                  <strong className="q-strong">{dimensionName}</strong>
                  <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                    {values.map((c) => (
                      <Link key={c.valueId} href={`/lens/${c.valueId}`} className="q-badge q-badge-neutral"
                        title={`${c.services} of your ${value.name} service${c.services === 1 ? '' : 's'} also ${dimensionName.toLowerCase()} ${c.valueName}`}>
                        {c.valueName}
                        <span style={{ marginLeft: '6px', opacity: 0.7 }}>{c.services}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* The fork. Stated as the question it is, because getting it wrong is
            how a studio ends up with forty near-identical services. */}
        <section className="q-card q-section">
          <h2 className="q-section-title">Do something about {value.name}</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            One question decides which: is it a <strong>different process</strong>, or the same process
            framed differently? Repackaging what you already do for a {value.name} special is a package.
            Work that runs differently start to finish is a service.
          </p>
          {/* Whichever answer the data supports leads. With nothing active
              filed under this value, a package has nothing to bundle, so
              offering it first would be pointing at the wrong door. */}
          <div className="q-row" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <Link
              href={`/packages/new?value=${encodeURIComponent(value.id)}`}
              className={`q-btn ${activeServices.length > 0 ? 'q-btn-primary' : 'q-btn-secondary'}`}
            >
              Package what you already do
            </Link>
            <Link
              href={newServiceHref}
              className={`q-btn ${activeServices.length > 0 ? 'q-btn-secondary' : 'q-btn-primary'}`}
            >
              It&rsquo;s a different process — new service
            </Link>
          </div>
          {activeServices.length === 0 && (
            <p className="q-meta-sm" style={{ marginTop: '12px', opacity: 0.7 }}>
              Nothing active is filed under {value.name} yet, so a package would have nothing to bundle —
              the new service is the honest starting point.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

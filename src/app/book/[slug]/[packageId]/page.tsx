import { notFound } from 'next/navigation';
import { formatMoney } from '@/kernel/currency';
import { getStudioBySlug } from '@/kernel/organizations';
import { getPackagePublic, getOpenVariablesForPackagePublic, getOpenClassificationsForPackagePublic, packageNarrowingValueIds } from '@/modules/packages/interface';
import { premisesValueIdsFor } from '@/modules/services/interface';
import { BookingForm } from './BookingForm';

export const dynamic = 'force-dynamic';

export default async function BookingPage(props: {
  params: Promise<{ slug: string; packageId: string }>
}) {
  const params = await props.params;

  // The public path carries a slug, not a session, so the org is resolved from
  // it and then passed explicitly to everything below.
  const org = await getStudioBySlug(params.slug);
  if (!org) notFound();

  const pkg = await getPackagePublic(org.id, params.packageId);
  if (!pkg) notFound();

  // What this package deliberately left open becomes the questions asked below.
  const openVariables = await getOpenVariablesForPackagePublic(org.id, params.packageId);
  /*
   * And the classifications this package has not settled.
   *
   * A package offering Birthday, Anniversary and Convocation is offering a
   * choice, not describing three simultaneous facts — a booking of it is for
   * exactly one. Narrowed to a single value the studio has already answered,
   * and nothing is asked.
   */
  const openClassifications = await getOpenClassificationsForPackagePublic(org.id, params.packageId);

  /*
   * Whether booking THIS package needs the studio's building, so the date field
   * only mentions opening hours when they apply. A wedding at the client's own
   * venue has nothing to do with when the office is open.
   */
  const [premisesValues, packageValues] = await Promise.all([
    premisesValueIdsFor(org.id),
    packageNarrowingValueIds(org.id, params.packageId),
  ]);

  const currencyCode = org.currency;
  const services = pkg.serviceNames;
  const deliverables = pkg.deliverableNames;
  const durationMin: number | null = pkg.durationMinutes;

  const durationLabel = durationMin
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
      : `${durationMin}m`
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(32px, 6vw, 80px) 24px' }}>
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>

        {/*
          * BACK TO THE PAGE THEY CAME FROM.
          *
          * This pointed at /storefront/[slug] — a second public catalogue that
          * exists but that no client is ever sent to. The link a studio copies
          * and hands out is /book/[slug], so "back" was landing people on a
          * page they had never seen, with a different list on it.
          */}
        <div style={{ marginBottom: '40px' }}>
          <a href={`/book/${params.slug}`} className="q-plain-link" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--q-color-ink-500)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>&larr;</span> {org.name}
          </a>
        </div>

        {/*
          * THE PICTURE, WITH THE NAME ON IT.
          *
          * This page opened with a heading on a plain card and never showed the
          * cover at all — so the one image the studio chose for the thing being
          * sold appeared on the catalogue and vanished the moment somebody
          * asked to see more. And the page a client reaches to decide showed
          * less than the card that sent them.
          *
          * The name sits on the picture because they are one statement. Stacked,
          * the page began with a label and then, separately, showed the thing it
          * was labelling.
          */}
        <div
          className={pkg.coverUrl ? 'q-hero' : 'q-hero q-hero-blank'}
          style={pkg.coverUrl
            ? { backgroundImage: `url(${pkg.coverUrl})`, backgroundPosition: pkg.coverPosition || undefined }
            : undefined}
        >
          {/* The figure, in the same place and the same shape as on the card
              that sent them here. Absent when the studio has not priced it. */}
          {pkg.price && (
            <span className="q-hero-price">
              {formatMoney(pkg.price.amount, pkg.price.currency || currencyCode)}
              {pkg.priceUnit && <span className="q-poster-price-unit">/{pkg.priceUnit}</span>}
            </span>
          )}
          <h1 className="q-hero-title">{pkg.name}</h1>
          {/* The line written for a card, where there is one — the paragraph
              below is the full account and does not belong on the picture. */}
          {pkg.shortDescription && <p className="q-hero-note">{pkg.shortDescription}</p>}
          {(durationLabel || deliverables.length > 0) && (
            <div className="q-hero-tags">
              {durationLabel && <span className="q-hero-tag">{durationLabel}</span>}
              {deliverables.map((d) => (
                <span key={d} className="q-hero-tag">{d}</span>
              ))}
            </div>
          )}
        </div>

        <div className="q-card" style={{ marginBottom: '32px', padding: '32px', borderRadius: '16px' }}>
          {/*
            * The full account, in full. It was clamped nowhere and shown here
            * as the only thing on the page; now the card carries a summary and
            * this carries what the studio actually wrote.
            */}
          {pkg.description && (
            <p className="q-text-body q-prewrap" style={{ margin: '0 0 24px', lineHeight: 1.65 }}>
              {pkg.description}
            </p>
          )}

          <div style={{ marginBottom: '32px' }}>
            {/* The form (which now renders a button that opens a wizard) */}
            <BookingForm
              orgId={org.id}
              packageId={pkg.id}
              packageName={pkg.name}
              formSchema={pkg.formSchema}
              openVariables={openVariables}
              openClassifications={openClassifications}
              premisesValueIds={premisesValues}
              packageValueIds={packageValues}
              currencyCode={currencyCode}
            />
          </div>

          {services.length > 0 && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '20px' }}>
              <div className="q-eyebrow" style={{ marginBottom: '12px' }}>Services included</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {services.map((s) => (
                  <span key={s} className="q-fact">{s}</span>
                ))}
              </div>
            </div>
          )}

          {deliverables.length > 0 && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '20px', marginTop: services.length > 0 ? '20px' : 0 }}>
              <div className="q-eyebrow" style={{ marginBottom: '12px' }}>What you receive</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {deliverables.map((d) => (
                  <span key={d} className="q-fact">{d}</span>
                ))}
              </div>
            </div>
          )}

          {durationLabel && (
            <div style={{ borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '20px', marginTop: '20px' }}>
              <div className="q-eyebrow" style={{ marginBottom: '6px' }}>Duration</div>
              <div className="q-strong">{durationLabel}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

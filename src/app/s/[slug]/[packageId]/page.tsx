import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { studioAtSlug } from '@/weave/jobs/requests';
import { packagesOffered } from '@/weave/packages/actions';
import { mediaOnOffer } from '@/weave/packages/media';
import { sayPackage } from '@/weave/packages/shape';
import { money } from '@/weave/store/shape';
import { BookingForm } from '../BookingForm';
import { Promised } from '@/components/Promised';

/**
 * One package, the size it deserves.
 *
 * A client who presses a photograph expects to arrive somewhere, and what
 * they arrive at is the work: the cover large, then everything else the
 * studio chose to show, then what is included, then the way to ask for it.
 *
 * The package is fixed here rather than chosen — they have already chosen by
 * being on this page, and asking again would be the software forgetting what
 * the client just did.
 */
export const dynamic = 'force-dynamic';

async function read(slug: string, packageId: string) {
  const studio = await studioAtSlug(slug);
  if (!studio) return null;

  /* Published only, by the same reader the storefront uses: a package being
   * worked on is not an offer, and a link to one must not become a side door
   * around that. */
  const offered = await packagesOffered(slug);
  const pack = offered.find((p) => p.id === packageId);
  if (!pack) return null;

  const media = await mediaOnOffer(studio.studioId, [pack.id]);
  return { studio, pack, media };
}

export async function generateMetadata({ params }: {
  params: Promise<{ slug: string; packageId: string }>;
}): Promise<Metadata> {
  const { slug, packageId } = await params;
  const found = await read(slug, packageId);
  if (!found) return { title: 'Not found' };
  return {
    title: `${found.pack.name} — ${found.studio.name}`,
    description: found.pack.about ?? `Request ${found.pack.name} with ${found.studio.name}.`,
  };
}

export default async function PackagePage({ params }: {
  params: Promise<{ slug: string; packageId: string }>;
}) {
  const { slug, packageId } = await params;
  const found = await read(slug, packageId);
  if (!found) notFound();
  const { studio, pack, media } = found;

  const [cover, ...rest] = media;

  return (
    <main className="q-auth">
      <div className="q-auth-card q-auth-card-front">
        <Link href={`/s/${slug}`} className="q-auth-mark q-back">{studio.name}</Link>

        {cover && (
          <div className="q-hero">
            {cover.kind === 'video' ? (
              <video
                className="q-hero-art" src={cover.url}
                muted loop playsInline autoPlay preload="metadata"
              />
            ) : (
              <img className="q-hero-art" src={cover.url} alt="" />
            )}
          </div>
        )}

        <h1 className="q-auth-title">{pack.name}</h1>

        {/*
          * The promise and the price together, because they are the two
          * halves of the same question. Said plainly rather than as a table
          * of specifications.
          */}
        <p className="q-offer-terms">
          {sayPackage(pack)}
          {pack.price !== null && <> · {money(pack.price, pack.currency)}</>}
        </p>

        {pack.about && <p className="q-auth-body">{pack.about}</p>}

        {/*
          * What arrives, as containers rather than as a sentence. Drawn
          * directly from the studio's sketch: the cover, and under it one
          * square per promised picture. Nothing is filled here because
          * nothing has been made yet — this is the offer, not the job.
          */}
        {pack.picturesPromised !== null && (
          <Promised promised={pack.picturesPromised} />
        )}

        {/* Everything else the studio chose to show, after the argument. */}
        {rest.length > 0 && (
          <div className="q-reel">
            {rest.map((m) => (
              <figure key={m.id} className="q-reel-frame">
                {m.kind === 'video' ? (
                  <video className="q-reel-art" src={m.url} muted loop playsInline controls preload="metadata" />
                ) : (
                  <img className="q-reel-art" src={m.url} alt={m.caption ?? ''} />
                )}
                {m.caption && <figcaption className="q-meta-sm">{m.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}

        <h2 className="q-section-title">Request this package</h2>
        <BookingForm
          slug={studio.slug} studioName={studio.name}
          packages={[]} media={[]} fixedPackageId={pack.id}
        />
      </div>
    </main>
  );
}

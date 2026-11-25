import Link from 'next/link';
import { sayPackage, type Package } from '@/weave/packages/shape';
import type { PackageMedia } from '@/weave/packages/media';
import { money } from '@/weave/store/shape';

/**
 * What a studio offers, shown as the work.
 *
 * Each card OPENS the package. It was a radio for a moment — pressing a
 * picture of a wedding selected a hidden form field and stayed where it was,
 * which is not what anybody expects a photograph to do. A picture of
 * something is a way into it.
 *
 * No border states and no tick. The card lifts under the cursor and the
 * cover eases up a fraction behind it; that is enough to say "this is a door"
 * without a hairline changing colour, which in light is near-black ink on a
 * card that already has one.
 *
 * A server component: nothing here needs state now that nothing is selected.
 */
export function PackageCards({ slug, packages, media }: {
  slug: string;
  packages: Package[];
  media: PackageMedia[];
}) {
  if (packages.length === 0) return null;

  return (
    <div className="q-choice-grid">
      {packages.map((p) => {
        const shots = media.filter((m) => m.packageId === p.id);
        const cover = shots[0] ?? null;

        return (
          <Link key={p.id} href={`/s/${slug}/${p.id}`} className="q-offer">
            <span className="q-offer-art">
              {cover ? (
                cover.kind === 'video' ? (
                  /* Muted and looping: a cover is a showreel, not something
                   * that starts talking at a stranger. */
                  <video
                    className="q-offer-frame" src={cover.url}
                    muted loop playsInline autoPlay preload="metadata"
                  />
                ) : (
                  <img className="q-offer-frame" src={cover.url} alt="" />
                )
              ) : (
                <span className="q-offer-bare">No pictures yet</span>
              )}

              {/* How much more there is, where a client can see it. */}
              {shots.length > 1 && <span className="q-offer-more">{shots.length}</span>}
            </span>

            <span className="q-offer-says">
              <strong className="q-offer-name">{p.name}</strong>
              <span className="q-meta-sm">{sayPackage(p)}</span>
              <span className="q-offer-price">
                {p.price === null ? 'Price on request' : money(p.price, p.currency)}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

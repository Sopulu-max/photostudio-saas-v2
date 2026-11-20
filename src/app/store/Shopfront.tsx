'use client';

import { RoomView } from '@/components/RoomView';
import type { PriceList, RoomScene } from '@/weave/store/shape';

/**
 * The shop, shown rather than described.
 *
 * A studio editing two tables has no idea what they are making. This is the
 * same component a client meets, fed with one of the studio's own pictures in
 * one of their own rooms, so the thing being edited is visible while it is
 * edited. Nothing below it needed explaining once this was here.
 *
 * Every absence says what is missing and what would fix it, because an empty
 * frame on the page a studio is trying to set up is the least useful thing
 * that could be there.
 */
export function Shopfront({
  scenes, lists, pictureUrl, galleryName,
}: {
  scenes: RoomScene[];
  lists: PriceList[];
  pictureUrl: string | null;
  galleryName: string | null;
}) {
  const products = lists.flatMap((list) => list.products);
  const measured = products.filter(
    (p) => p.size || p.variants.some((v) => v.size),
  );
  const hangable = scenes.filter((s) => s.url && s.hangs);

  const missing =
    products.length === 0 ? 'Add a product below to preview it here.'
      : measured.length === 0 ? 'No product has dimensions set. Add width and height to a print below.'
        : hangable.length === 0 ? 'Add a room photograph below and set its wall width to enable the preview.'
          : !pictureUrl ? 'No gallery is linked to a price list, so there is no image to preview.'
            : null;

  return (
    <section className="q-stack q-stack-sm">
      <h2 className="q-section-title">Client preview</h2>

      {missing ? (
        <p className="q-empty-lg q-shopfront-gap">{missing}</p>
      ) : (
        <>
          <RoomView
            photoUrl={pictureUrl}
            scenes={scenes}
            products={products}
            currency={products[0]?.currency ?? 'NGN'}
            buyable={false}
            onAdd={() => { /* Never called: the studio is looking, not buying. */ }}
          />
          {galleryName && (
            <p className="q-meta-sm">
              Preview uses an image from {galleryName}. Clients see their own.
            </p>
          )}
        </>
      )}
    </section>
  );
}

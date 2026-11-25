import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { priceLists } from '@/weave/store/actions';
import { roomScenes } from '@/weave/store/scenes';
import { sayShopfront, theShopfront } from '@/weave/store/front';
import { Shopfront } from './Shopfront';
import { PriceLists } from './PriceLists';
import { RoomScenes } from './RoomScenes';

export const dynamic = 'force-dynamic';

/**
 * What you sell — led by the shop, not by the tables behind it.
 *
 * This page used to open with "1 price list", which is a count of a database
 * table and tells a studio nothing. Worse, a studio could fill in every table
 * on it and still be selling nothing, because what makes a picture buyable is
 * a gallery pointing at a price list and that lived on another screen. A page
 * about selling has to answer whether you are selling.
 *
 * So it opens with the shop as a client meets it — their own picture, in
 * their own room, at the sizes they offer — and then with what is in it.
 */
export default async function StorePage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const [lists, scenes, front] = await Promise.all([
    priceLists(), roomScenes(), theShopfront(),
  ]);

  const things = lists.reduce((n, list) => n + list.products.length, 0);
  const said = await sayShopfront(front, scenes.length, things);

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Products</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        <Shopfront
          scenes={scenes}
          lists={lists}
          pictureUrl={front.samplePictureUrl}
          galleryName={front.sampleGalleryName}
        />
        <PriceLists lists={lists} />
        <RoomScenes scenes={scenes} />
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { openGallery } from '@/weave/galleries/actions';
import { whatIsForSale } from '@/weave/store/actions';
import { scenesForGallery } from '@/weave/store/scenes';
import { AccessGate } from './AccessGate';
import { Viewer } from './Viewer';

/**
 * The gallery as the client meets it.
 *
 * No session, no account, no studio navigation — a link and the pictures. A
 * gallery that has not been shared returns nothing at all: holding the token is
 * not permission, and a gallery being built is not a gallery being sent.
 */
export const dynamic = 'force-dynamic';

export default async function GalleryPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const gallery = await openGallery(token);

  if (!gallery) notFound();
  if ('locked' in gallery) {
    return <AccessGate token={gallery.token} name={gallery.name} studioName={gallery.studioName} />;
  }

  const [forSale, scenes] = await Promise.all([
    whatIsForSale(token),
    // The studio's own rooms, so a print is seen on a real wall.
    scenesForGallery(token),
  ]);

  return <Viewer gallery={gallery} forSale={forSale} scenes={scenes} />;
}

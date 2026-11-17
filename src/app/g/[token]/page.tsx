import { notFound } from 'next/navigation';
import { openGallery } from '@/weave/galleries/actions';
import { Viewer } from './Viewer';

/**
 * The gallery as the client meets it.
 *
 * No session, no account, no sidebar — a link and the pictures. A gallery that
 * has not been shared returns nothing at all: holding the token is not
 * permission, and a gallery being built is not a gallery being sent.
 */
export const dynamic = 'force-dynamic';

export default async function GalleryPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gallery = await openGallery(token);
  if (!gallery) notFound();

  return <Viewer gallery={gallery} />;
}

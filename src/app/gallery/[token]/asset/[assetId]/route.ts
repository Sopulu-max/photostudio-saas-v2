import type { NextRequest } from 'next/server';
import { resolveGalleryAsset, isGalleryRendition } from '@/modules/delivery/interface';

export const dynamic = 'force-dynamic';

/**
 * One image out of a client gallery, at a size.
 *
 * The gallery page renders plain <img> tags pointing here rather than signing
 * every file up front, so opening a 400-image delivery no longer costs 400
 * storage calls before the HTML goes out. The browser asks for what it scrolls
 * to; everything below the fold is never requested at all.
 *
 * We redirect to a short-lived signed URL instead of streaming the bytes: the
 * image then travels straight from storage to the client, and this route stays
 * a permission check rather than a bandwidth bottleneck.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; assetId: string }> }
) {
  const { token, assetId } = await params;

  const requested = request.nextUrl.searchParams.get('size') || 'grid';
  if (!isGalleryRendition(requested)) {
    return new Response('Unknown size', { status: 400 });
  }

  const resolved = await resolveGalleryAsset(token, assetId, requested);
  // Same answer for a bad token, a revoked gallery and a file from someone
  // else's delivery: a 404 that distinguishes them is a membership oracle.
  if (!resolved) return new Response('Not found', { status: 404 });

  const wantsDownload = request.nextUrl.searchParams.get('download') === '1';
  const location = wantsDownload
    ? `${resolved.url}&download=${encodeURIComponent(resolved.fileName)}`
    : resolved.url;

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Comfortably inside the signed URL's own hour, so a client scrolling
      // back up re-uses the redirect instead of re-signing, and no cache
      // outlives the link it points at.
      'Cache-Control': 'private, max-age=1500',
    },
  });
}

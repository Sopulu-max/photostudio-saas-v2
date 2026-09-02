import { NextRequest } from 'next/server';
import { getBookingByShareToken } from '@/modules/bookings/interface';
import { renderPageToPdf } from '@/lib/documents/pdf';

// A browser has to start, so this is never a static or edge route.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The booking confirmation as a file.
 *
 * The token is checked before a browser is started: rendering costs a Chromium
 * launch, and an unknown token should cost a database read instead. It also
 * names the file — what lands in somebody's downloads folder should say what
 * the booking is, not repeat a token back at them.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const booking = await getBookingByShareToken(token);
  if (!booking) return new Response('Not found', { status: 404 });

  const origin = request.nextUrl.origin;
  const name = `${String(booking.title || 'booking').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'booking'}.pdf`;

  try {
    const pdf = await renderPageToPdf(`${origin}/booking/${token}`);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        // What is owed moves as payments land, so a stale copy would misstate
        // the one figure a client checks.
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('Failed to render booking PDF:', e);
    return new Response(e?.message || 'Could not build that PDF', { status: 500 });
  }
}

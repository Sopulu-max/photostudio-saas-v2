import { NextRequest } from 'next/server';
import { getInvoiceByToken } from '@/modules/finances/interface';
import { renderPageToPdf } from '@/lib/documents/pdf';

// A browser has to start, so this is never a static or edge route.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The invoice as a file.
 *
 * The token is checked here before a browser is started: rendering is
 * expensive, and an unknown token should cost a database read, not a Chromium
 * launch. It's also what names the file — a client's downloads folder should
 * say INV-0007.pdf, not a token.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  const invoice = await getInvoiceByToken(token);
  if (!invoice) return new Response('Not found', { status: 404 });

  const origin = request.nextUrl.origin;
  const name = `${invoice.number || 'invoice'}.pdf`;

  try {
    const pdf = await renderPageToPdf(`${origin}/invoice/${token}`);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        // The document changes as payments land, so it must not be cached.
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('Failed to render invoice PDF:', e);
    return new Response(e?.message || 'Could not build that PDF', { status: 500 });
  }
}

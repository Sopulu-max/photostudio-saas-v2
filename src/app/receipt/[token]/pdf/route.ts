import { NextRequest } from 'next/server';
import { getReceiptByToken } from '@/modules/finances/interface';
import { renderPageToPdf } from '@/lib/documents/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The receipt as a file, named for its number. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  const payment = await getReceiptByToken(token);
  if (!payment) return new Response('Not found', { status: 404 });

  const origin = request.nextUrl.origin;
  const name = `${payment.receipt_number || 'receipt'}.pdf`;

  try {
    const pdf = await renderPageToPdf(`${origin}/receipt/${token}`);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('Failed to render receipt PDF:', e);
    return new Response(e?.message || 'Could not build that PDF', { status: 500 });
  }
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listInvoices } from '@/modules/finances/interface';
import { getStudioCurrency } from '@/kernel/organizations';
import { InvoicesClient } from './client';

export const dynamic = 'force-dynamic';

/**
 * EVERY INVOICE, WHICH HAD NOWHERE TO BE READ.
 *
 * /finances drew the first eight and stopped. Not paginated, not capped at the
 * query — listInvoices returns every row a studio has, and the page sliced
 * eight off the front and moved on to the transaction table without a count, a
 * link, or any sign the rest existed. This path was a 404, so an invoice past
 * the eighth was reachable only by opening the booking it was raised from and
 * following it back.
 *
 * A silent cap reads as completeness, which is the one thing it must never do
 * with money.
 */
export default async function InvoicesPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [invoices, currencyCode] = await Promise.all([
    listInvoices(),
    getStudioCurrency(),
  ]);

  return (
    <div>
      <Link className="q-back" href="/finances">&larr; Finances</Link>

      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Invoices</h1>
          <p className="q-page-subtitle">
            Every invoice this studio has raised, and what is still owed on it.
          </p>
        </div>
      </header>

      <InvoicesClient invoices={invoices as any[]} currencyCode={currencyCode} />
    </div>
  );
}

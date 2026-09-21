import { supabaseAdmin } from '@/lib/supabase/admin';
import { amountOf } from '@/kernel/money';
import { describeInvoiceLine, invoiceLineAmount, invoiceTotals } from './money';

/**
 * A DRAFT FOLLOWS THE BOOKING; AN ISSUED INVOICE IS FROZEN.
 *
 * An invoice becomes a document when it is issued - a number is spent, the
 * client holds it, the lines stop being editable. Before that it is the
 * booking, read as a bill. Raised with the booking and never revisited, a
 * draft said 20,000 after an extra had taken the booking to 25,000, and the
 * page called that "fully invoiced".
 *
 * So an extra taken on a line reaches every DRAFT carrying that line, as a
 * row of its own beside the package's row - the same shape a new invoice
 * would give it - and leaves again when the extra is removed. Issued
 * invoices are not touched; what they did not bill shows as left to invoice.
 *
 * Only extras. A draft raised for SOME of a booking's lines (a partial bill)
 * chose its lines on purpose, so a package added to the booking later is not
 * pushed onto it; an extra belongs to a line the draft already carries.
 *
 * A plain module: it takes the organization as a parameter, and an exported
 * async function of a 'use server' file is an endpoint.
 */

export type ExtraTaken = {
  id: string;
  bookingLineId: string;
  label: string;
  units: number;
  unitRate: unknown;
};

/** Tax and discount, re-derived for a draft whose lines just changed. */
async function refreshDraftFigures(orgId: string, invoiceId: string) {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, tax_rate, discount_kind, discount_value, discount_amount, lines:invoice_lines(amount)')
    .eq('id', invoiceId).eq('organization_id', orgId).maybeSingle();
  if (!inv) return;
  const subtotal = ((inv.lines || []) as any[]).reduce((n, l) => n + Number(l.amount || 0), 0);
  /*
   * A percentage is a share of whatever the bill comes to, so it moves with
   * the subtotal; a flat sum was a flat sum and stays. Tax is on what is
   * asked for, after the discount, at the rate this draft already carries.
   */
  const { discount, tax } = invoiceTotals({
    subtotal,
    discountKind: (inv as any).discount_kind ?? null,
    discountValue: (inv as any).discount_value ?? null,
    discountAmount: (inv as any).discount_kind === 'percentage' ? null : (inv as any).discount_amount ?? null,
    taxRate: Number((inv as any).tax_rate || 0),
  });
  await supabaseAdmin
    .from('invoices')
    .update({ discount_amount: discount, tax_amount: tax })
    .eq('id', invoiceId).eq('organization_id', orgId);
}

/** Every open draft that carries this line, with the row it carries it on. */
async function draftsCarrying(orgId: string, bookingLineId: string) {
  const { data } = await supabaseAdmin
    .from('invoice_lines')
    .select('id, invoice_id, description, unit_price, position, booking_line_extra_id, invoice:invoices!inner(id, status, voided_at)')
    .eq('organization_id', orgId)
    .eq('booking_line_id', bookingLineId)
    .is('booking_line_extra_id', null)
    .eq('invoice.status', 'draft')
    .is('invoice.voided_at', null);
  return (data || []) as any[];
}

/** Put the extra on every draft carrying its line. */
export async function reflectExtraOnDrafts(orgId: string, extra: ExtraTaken, packageUnitAmount: number) {
  const rows = await draftsCarrying(orgId, extra.bookingLineId);
  for (const row of rows) {
    const { count } = await supabaseAdmin
      .from('invoice_lines').select('id', { count: 'exact', head: true })
      .eq('invoice_id', row.invoice_id).eq('booking_line_extra_id', extra.id);
    if ((count ?? 0) > 0) continue;

    /*
     * The share this draft bills - a deposit draft for half the work bills
     * half the extra too. Read back off the package's own row rather than
     * stored: the row was the package's figure times the share.
     */
    const share = packageUnitAmount > 0 ? Math.min(1, Number(row.unit_price) / packageUnitAmount) : 1;
    const title = String(row.description || '').split(' — ')[0].split(' · ')[0] || 'Booking line';
    const { amount, unitPrice } = invoiceLineAmount({ unitAmount: amountOf(extra.unitRate), quantity: extra.units, share });

    // Straight after the package's row: everything below it moves down one.
    const { data: below } = await supabaseAdmin
      .from('invoice_lines').select('id, position')
      .eq('invoice_id', row.invoice_id).gt('position', row.position);
    for (const b of ((below || []) as any[]).sort((a, c) => c.position - a.position)) {
      await supabaseAdmin.from('invoice_lines').update({ position: b.position + 1 }).eq('id', b.id);
    }
    await supabaseAdmin.from('invoice_lines').insert({
      organization_id: orgId,
      invoice_id: row.invoice_id,
      booking_line_id: extra.bookingLineId,
      booking_line_extra_id: extra.id,
      description: describeInvoiceLine({ title: `${title} · ${extra.label}`, details: [] }),
      quantity: extra.units,
      unit_price: unitPrice,
      amount,
      position: row.position + 1,
    });
    await refreshDraftFigures(orgId, row.invoice_id);
  }
}

/** Take the extra off every draft it is on. Issued invoices keep their row. */
export async function dropExtraFromDrafts(orgId: string, extraId: string) {
  const { data } = await supabaseAdmin
    .from('invoice_lines')
    .select('id, invoice_id, invoice:invoices!inner(status, voided_at)')
    .eq('organization_id', orgId)
    .eq('booking_line_extra_id', extraId)
    .eq('invoice.status', 'draft')
    .is('invoice.voided_at', null);
  const touched = new Set<string>();
  for (const row of (data || []) as any[]) {
    await supabaseAdmin.from('invoice_lines').delete().eq('id', row.id).eq('organization_id', orgId);
    touched.add(row.invoice_id);
  }
  for (const invoiceId of touched) await refreshDraftFigures(orgId, invoiceId);
}

import { notFound } from 'next/navigation';
import { getInvoiceByToken, KINDS, kindOf } from '@/modules/finances/interface';
import { formatMoney } from '@/kernel/currency';

export const dynamic = 'force-dynamic';

/**
 * The client's own view of an invoice, on a share token — the same capability
 * model as a delivery gallery, and the same reason: no account, no session,
 * just the link they were sent.
 *
 * There is no separate receipt page, and there shouldn't be. Once the payments
 * cover it, this document answers "have I been paid?" with yes and reads as a
 * receipt. Building a second page would mean two records of one fact, and the
 * usual outcome of that is one of them being wrong.
 */
export default async function PublicInvoicePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const invoice = await getInvoiceByToken(params.token);
  if (!invoice) notFound();

  const currency = invoice.currency || 'USD';
  const org = (invoice as any).organization;
  const isVoid = invoice.status === 'void';
  const paidInFull = invoice.settled;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--q-color-paper-subtle)', padding: 'clamp(32px, 6vw, 80px) 24px' }}>
      <div style={{ width: '100%', maxWidth: '680px', margin: '0 auto' }}>

        <div className="q-card" style={{ padding: 'clamp(24px, 5vw, 44px)', borderRadius: '16px' }}>

          <div className="q-row q-row-between" style={{ alignItems: 'flex-start', marginBottom: '32px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--q-color-ink-400)' }}>
                {isVoid ? 'Withdrawn' : paidInFull ? 'Receipt' : 'Invoice'}
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--q-color-ink-900)' }}>
                {invoice.number}
              </h1>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, color: 'var(--q-color-ink-900)' }}>{org?.name}</div>
              {invoice.issued_at && (
                <div className="q-meta-sm">{new Date(invoice.issued_at).toLocaleDateString()}</div>
              )}
            </div>
          </div>

          {isVoid ? (
            <div className="q-note q-note-bad" style={{ marginBottom: '24px' }}>
              This invoice was withdrawn by {org?.name}. Nothing is owed on it.
            </div>
          ) : paidInFull ? (
            <div className="q-note q-note-good" style={{ marginBottom: '24px' }}>
              Paid in full{invoice.payments.length > 0 ? ' — thank you.' : '.'}
            </div>
          ) : null}

          <div style={{ marginBottom: '28px' }}>
            <div className="q-meta-sm">Billed to</div>
            <div style={{ fontWeight: 600, color: 'var(--q-color-ink-900)' }}>
              {invoice.contact?.display_name || '—'}
            </div>
            {invoice.contact?.email && <div className="q-meta">{invoice.contact.email}</div>}
          </div>

          <div className="q-table-container">
            <table className="q-table">
              <thead>
                <tr>
                  <th className="q-table-th">Description</th>
                  <th className="q-table-th">Qty</th>
                  <th className="q-table-th">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l: any) => (
                  <tr key={l.id} className="q-table-tr">
                    <td className="q-table-td q-strong">{l.description}</td>
                    <td className="q-table-td q-num">{Number(l.quantity)}</td>
                    <td className="q-table-td q-num q-strong">{formatMoney(Number(l.amount), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="q-stack q-stack-sm" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--q-color-ink-100)' }}>
            <div className="q-row q-row-between">
              <span className="q-meta">Total</span>
              <strong className="q-num" style={{ fontSize: '1.1rem' }}>{formatMoney(invoice.total, currency)}</strong>
            </div>

            {invoice.payments
              .filter((p: any) => p.status === 'settled')
              .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
              .map((p: any) => {
                const spec = KINDS[kindOf(p)];
                return (
                  <div key={p.id} className="q-row q-row-between">
                    <span className="q-meta q-cap">
                      {String(p.type).replace(/_/g, ' ')}
                      <span className="q-meta-sm">
                        {' · '}{new Date(p.settled_at || p.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="q-num">
                      {spec.direction === 'inbound' ? '−' : '+'}{formatMoney(Number(p.amount), p.currency || currency)}
                    </span>
                  </div>
                );
              })}

            {!isVoid && (
              <div className="q-row q-row-between" style={{ paddingTop: '10px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                <strong>{paidInFull ? 'Nothing outstanding' : 'Outstanding'}</strong>
                <strong className="q-num" style={{ fontSize: '1.25rem', color: invoice.outstanding > 0 ? 'var(--q-color-accent-hi)' : 'var(--q-color-ink-900)' }}>
                  {formatMoney(invoice.outstanding, currency)}
                </strong>
              </div>
            )}
          </div>

          {invoice.notes && (
            <p className="q-meta" style={{ marginTop: '24px', lineHeight: 1.6 }}>{invoice.notes}</p>
          )}

          {invoice.due_at && !paidInFull && !isVoid && (
            <p className="q-meta-sm" style={{ marginTop: '16px' }}>
              Due by {new Date(invoice.due_at).toLocaleDateString()}.
            </p>
          )}
        </div>

        <p className="q-meta-sm" style={{ textAlign: 'center', marginTop: '20px' }}>
          Questions about this? Reply to {org?.name} directly.
        </p>
      </div>
    </div>
  );
}

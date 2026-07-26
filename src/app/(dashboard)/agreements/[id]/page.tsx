import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import Link from 'next/link';
import { FileText, Play } from 'lucide-react';
import { ActivateAgreementButton } from './AgreementActions';

export const dynamic = 'force-dynamic';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

function money(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] || '';
  return `${sym}${Number(amount || 0).toLocaleString()} ${currency}`;
}

export default async function AgreementDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { orgId, userId } = await getAuthOrgId();

  const { data: agreement } = await supabaseAdmin
    .from('agreements')
    .select(`
      *,
      person:persons(display_name, email),
      workflows(id, status)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single();

  if (!agreement) notFound();

  const { data: transactions } = await supabaseAdmin
    .from('financial_transactions')
    .select('id, type, direction, amount, currency, status')
    .eq('organization_id', orgId)
    .eq('agreement_id', agreement.id)
    .order('created_at', { ascending: true });

  const terms = agreement.terms || {};
  const basePrice = terms.base_price || 0;
  const depositPercent = terms.deposit_percentage || 0;
  const currency = terms.currency || 'USD';
  const depositAmount = (basePrice * depositPercent) / 100;

  const isProposed = ['proposed', 'modified'].includes(agreement.status);
  const isActive = agreement.status === 'active';

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <div style={{ marginBottom: '16px' }}>
          <Link href="/agreements" style={{ color: 'var(--q-color-ink-500)', textDecoration: 'none', fontSize: '0.875rem' }}>
            &larr; Back to Agreements
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="q-page-title">Agreement v{agreement.version}</h1>
            <p className="q-page-subtitle">Client: {agreement.person?.display_name}</p>
          </div>
          <span className={`q-badge ${isActive ? 'q-badge-success' : 'q-badge-neutral'}`}>
            {agreement.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Ignition — the deliberate step that starts the production engine. */}
        {isProposed && (
          <div className="q-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px', borderColor: 'color-mix(in srgb, var(--q-color-accent) 40%, transparent)' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem' }}>Ready to start</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                Activating spawns the production workflow and raises the {money(depositAmount, currency)} deposit invoice.
              </p>
            </div>
            <ActivateAgreementButton agreementId={agreement.id} orgId={orgId} actorId={userId} />
          </div>
        )}

        {/* Terms */}
        <div className="q-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem' }}>Terms &amp; Proposal</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                The formal terms agreed upon for this production.
              </p>
            </div>
            <button className="q-btn q-btn-secondary">
              <FileText size={16} style={{ marginRight: '8px' }} />
              View Document
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '8px' }}>
            <div style={{ padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Total</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{money(basePrice, currency)}</div>
            </div>
            <div style={{ padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Deposit</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{depositPercent}%</div>
            </div>
            <div style={{ padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '8px', border: '1px solid var(--q-color-ink-100)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Due now</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{money(depositAmount, currency)}</div>
            </div>
          </div>
        </div>

        {/* Money the cascade produced */}
        {transactions && transactions.length > 0 && (
          <div className="q-card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Invoices &amp; Payments</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {transactions.map((tx: any) => (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px', textTransform: 'capitalize' }}>{String(tx.type).replace(/_/g, ' ')}</strong>
                    <span className={`q-badge ${tx.status === 'settled' ? 'q-badge-success' : 'q-badge-warning'}`}>{tx.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>{money(tx.amount, tx.currency)}</span>
                    <Link href={`/finances/${tx.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem' }}>
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workflows */}
        <div className="q-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', fontWeight: 600 }}>Associated Workflows</h2>
          {!agreement.workflows || agreement.workflows.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)' }}>
              {isProposed
                ? 'None yet — activating this agreement will spawn the production pipeline.'
                : 'No active workflows attached to this agreement yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agreement.workflows.map((wf: any) => (
                <div key={wf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>Production Pipeline</strong>
                    <span className={`q-badge ${wf.status === 'completed' ? 'q-badge-success' : 'q-badge-warning'}`}>{wf.status}</span>
                  </div>
                  <Link href={`/workflows/${wf.id}`} className="q-btn q-btn-primary">
                    <Play size={16} style={{ marginRight: '8px' }} />
                    Open Board
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

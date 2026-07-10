import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { FinanceRepository } from '@/lib/domains/finance/repository';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';
import { StateBadge } from '@/components/ontology/StateBadge';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { Invitation } from '@/components/ontology/Invitation';
import { AgreementControls } from './AgreementControls';
import { AgreementDetailDrawer } from '@/components/finance/AgreementDetailDrawer';
import { InvoiceControls } from './InvoiceControls';

export const dynamic = 'force-dynamic';

async function getFinanceData(orgId: string | null) {
  let agreements: any[] = [];
  let invoices: any[] = [];
  let events: any[] = [];
  let dbOffline = false;

  if (orgId) {
    try {
      const supabase = await createClient();
      const kernelRepo = new KernelRepository(supabase);
      const financeRepo = new FinanceRepository(supabase);

      agreements = await kernelRepo.getAgreementsByOrganization(orgId);
      invoices = await financeRepo.getInvoices(orgId).catch(() => []);

      const { data: dbEvents } = await supabase
        .from('events')
        .select('*')
        .eq('organization_id', orgId)
        .eq('entity_type', 'agreement');
      if (dbEvents) events = dbEvents;
    } catch (error) {
      console.error('Database connection failed', error);
      dbOffline = true;
    }
  }

  return { agreements, invoices, events, dbOffline };
}

export default async function FinanceLedgerPage() {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  const { agreements, invoices, events, dbOffline } = await getFinanceData(orgId);

  // Compute summary metrics
  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum: number, i: any) => sum + Number(i.total_amount || 0), 0);
  const totalOutstanding = invoices
    .filter(i => i.status !== 'paid' && i.status !== 'voided')
    .reduce((sum: number, i: any) => sum + Number(i.total_amount || 0), 0);
  const activeAgreements = agreements.filter(a => a.status === 'active').length;

  return (
    <div style={{ padding: '48px', maxWidth: '1200px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}

      {/* Page Header */}
      <header style={{
        marginBottom: '40px',
        paddingBottom: '24px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-family-serif)',
          fontSize: '2.5rem',
          fontWeight: 700,
          margin: '0 0 8px 0',
          letterSpacing: '-0.02em',
        }}>
          Ledger
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1rem' }}>
          The financial backbone of the studio. Invoices are derived automatically from active agreements.
        </p>
      </header>

      {/* Metrics Strip — ledger-style summary line */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1px',
        background: 'var(--color-border-subtle)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        marginBottom: '48px',
      }}>
        <MetricCell
          label="Collected Revenue"
          value={`₦${totalPaid.toLocaleString()}`}
          accent="var(--color-state-success)"
        />
        <MetricCell
          label="Outstanding"
          value={`₦${totalOutstanding.toLocaleString()}`}
          accent={totalOutstanding > 0 ? 'var(--color-state-waiting)' : 'var(--color-state-success)'}
        />
        <MetricCell
          label="Active Agreements"
          value={String(activeAgreements)}
          accent="var(--color-state-active)"
        />
      </div>

      {/* Two-column ledger */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'start' }}>

        {/* INVOICES */}
        <section>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            marginBottom: '20px',
          }}>
            Derived Invoices ({invoices.length})
          </div>

          {invoices.length === 0 ? (
            <Invitation label="No invoices generated yet" actionLabel="Invoices appear automatically when an agreement is activated" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                padding: '6px 12px',
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                borderBottom: '1px solid var(--color-border-subtle)',
              }}>
                <div>Reference</div>
                <div>Amount</div>
                <div>Status</div>
              </div>

              {invoices.map(inv => {
                const isPaid = inv.status === 'paid';
                return (
                  <div key={inv.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    padding: '14px 12px',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    alignItems: 'center',
                    gap: '12px',
                    background: isPaid ? 'rgba(56, 176, 0, 0.02)' : 'var(--color-surface-elevated)',
                    borderLeft: isPaid ? '3px solid var(--color-state-success)' : '3px solid transparent',
                  }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
                        INV-{inv.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        from AGR-{inv.agreement_id?.slice(0, 8).toUpperCase()}
                      </div>
                    </div>

                    <div style={{
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: '1rem',
                      fontWeight: 600,
                      textAlign: 'right',
                    }}>
                      {Number(inv.total_amount).toLocaleString()}
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>
                        {inv.currency}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                      <StateBadge state={isPaid ? 'completed' : 'waiting'} label={inv.status.toUpperCase()} />
                      {!isPaid && (
                        <InvoiceControls
                          invoiceId={inv.id}
                          amountDue={Number(inv.total_amount)}
                          isPaid={isPaid}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* AGREEMENTS */}
        <section>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            marginBottom: '20px',
          }}>
            Agreements ({agreements.length})
          </div>

          {agreements.length === 0 ? (
            <Invitation label="No agreements yet" actionLabel="Agreements are created when a booking Request is accepted" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agreements.map(agr => {
                const isProposed = agr.status === 'proposed';
                const price = agr.terms?.price;

                return (
                  <div key={agr.id} style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: '0',
                    borderTop: '3px solid var(--color-border-focus)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                          AGR-{agr.id.slice(0, 8).toUpperCase()}
                        </div>
                        {price && (
                          <div style={{ fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-primary)' }}>
                            {Number(price).toLocaleString()}
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>
                              {agr.terms?.currency || 'NGN'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <StateBadge state={agr.status as any} />
                        {isProposed && <AgreementControls agrId={agr.id} />}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px' }}>
                      <AgreementDetailDrawer agreement={agr} events={events} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function MetricCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-elevated)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: '1.75rem',
        fontWeight: 700,
        color: accent,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

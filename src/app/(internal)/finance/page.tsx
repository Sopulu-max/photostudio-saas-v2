import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { FinanceRepository } from '@/lib/domains/finance/repository';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';
import { StateBadge } from '@/components/ontology/StateBadge';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { AgreementControls } from './AgreementControls';
import { AgreementDetailDrawer } from '@/components/finance/AgreementDetailDrawer';
import { InvoiceControls } from './InvoiceControls';
import Link from 'next/link';

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
      invoices = await financeRepo.getInvoices(orgId);

      const { data: dbEvents } = await supabase
        .from('events')
        .select('*')
        .eq('organization_id', orgId)
        .eq('entity_type', 'agreement');
      if (dbEvents) events = dbEvents;
    } catch (error) {
      console.error("Database connection failed", error);
      dbOffline = true;
    }
  }

  return { agreements, invoices, events, dbOffline };
}

export default async function FinanceLedgerPage() {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  const { agreements, invoices, events, dbOffline } = await getFinanceData(orgId);

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}
      
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2rem', marginBottom: '8px' }}>
          Ledger
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          The financial backbone of the studio. Invoices are derived from agreements.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        
        {/* INVOICES SECTION */}
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--color-text-primary)' }}>Derived Invoices</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {invoices.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border-subtle)', borderRadius: '8px' }}>
                No invoices generated yet.
              </div>
            ) : (
              invoices.map(inv => {
                const isPaid = inv.status === 'paid';
                return (
                  <div key={inv.id} style={{ 
                    background: 'var(--color-surface-elevated)', 
                    borderRadius: '8px', 
                    border: `1px solid ${isPaid ? 'var(--color-state-success)' : 'var(--color-border-subtle)'}`,
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-family-mono)' }}>
                        INV-{inv.id.slice(0,8).toUpperCase()}
                      </span>
                      <StateBadge state={isPaid ? 'completed' : 'waiting'} label={inv.status.toUpperCase()} />
                    </div>
                    
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {Number(inv.total_amount).toLocaleString()} {inv.currency}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
                        From AGR-{inv.agreement_id?.slice(0,8).toUpperCase()}
                      </span>
                      <InvoiceControls 
                        invoiceId={inv.id} 
                        amountDue={Number(inv.total_amount)} 
                        isPaid={isPaid} 
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AGREEMENTS SECTION */}
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--color-text-primary)' }}>Agreements</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {agreements.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border-subtle)', borderRadius: '8px' }}>
                No agreements found.
              </div>
            ) : (
              agreements.map(agr => {
                const isProposed = agr.status === 'proposed';
                return (
                  <div key={agr.id} style={{ 
                    background: 'var(--color-surface-elevated)', 
                    borderRadius: '8px', 
                    border: '1px solid var(--color-border-subtle)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-family-mono)' }}>
                            AGR-{agr.id.slice(0,8).toUpperCase()}
                          </span>
                          <StateBadge state={agr.status as any} label={agr.status} />
                        </div>
                        <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                          {agr.terms?.price ? `${agr.terms.price} ${agr.terms.currency || 'NGN'}` : 'Unpriced'}
                        </span>
                      </div>
                      
                      {isProposed && (
                        <AgreementControls agrId={agr.id} />
                      )}
                    </div>
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
                       <AgreementDetailDrawer agreement={agr} events={events} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

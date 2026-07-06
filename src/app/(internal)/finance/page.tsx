import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';
import { StateBadge } from '@/components/ontology/StateBadge';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { AgreementControls } from './AgreementControls';
import { AgreementDetailDrawer } from '@/components/finance/AgreementDetailDrawer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getAgreementsData(orgId: string | null) {
  let agreements: any[] = [];
  let events: any[] = [];
  let dbOffline = false;

  if (orgId) {
    try {
      const supabase = await createClient();
      const repo = new KernelRepository(supabase);
      
      agreements = await repo.getAgreementsByOrganization(orgId);

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

  return { agreements, events, dbOffline };
}

export default async function FinanceLedgerPage() {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  const { agreements, events, dbOffline } = await getAgreementsData(orgId);

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2rem', marginBottom: '8px' }}>
          Ledger & Agreements
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          The financial backbone of the studio. Activate proposed agreements and track settlement.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {agreements.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
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
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                        AGR-{agr.id.slice(0,8).toUpperCase()}
                      </span>
                      <StateBadge state={agr.status as any} label={agr.status} />
                    </div>
                    <Link href={`/customers/${agr.customerId}`} style={{ fontSize: '0.9rem', color: 'var(--color-state-active)', textDecoration: 'none' }}>
                      View Customer Lineage
                    </Link>
                  </div>
                  
                  {isProposed && (
                    <AgreementControls agrId={agr.id} />
                  )}
                </div>

                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Terms summary</h3>
                    <div style={{ 
                      background: 'var(--color-surface-base)', 
                      padding: '16px', 
                      borderRadius: '6px', 
                      border: '1px solid var(--color-border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)' }}>Price</span>
                        <span style={{ fontWeight: 600 }}>{agr.terms?.price ? `${agr.terms.price} ${agr.terms.currency || 'NGN'}` : 'N/A'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)' }}>Deliverables</span>
                        <span style={{ fontSize: '0.85rem' }}>{agr.terms?.deliverables || 'Standard'}</span>
                      </div>
                      
                      <div style={{ marginTop: '4px', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                        <AgreementDetailDrawer agreement={agr} events={events} />
                      </div>
                    </div>
                  </div>
                  
                  {agr.instances && agr.instances.length > 0 && (
                    <div style={{ flex: '1 1 300px' }}>
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Governed Instances</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {agr.instances.map((inst: any) => (
                          <div key={inst.id} style={{ padding: '8px', background: 'var(--color-surface-base)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)' }}>
                            <EntitySignature type="service_instance" data={inst} scale="row" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

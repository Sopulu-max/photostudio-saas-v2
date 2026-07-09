import React from 'react';
import { getPortalCustomer } from '@/app/actions/portal';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { resolveEntityForAudience } from '@/lib/domains/presentation/resolver';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge } from '@/components/ontology/StateBadge';

export const dynamic = 'force-dynamic';

export default async function PortalDashboardPage({ params }: { params: Promise<any> }) {
  const { orgId } = await params;
  const customerId = await getPortalCustomer(orgId);
  
  if (!customerId) {
    redirect(`/${orgId}/portal/login`);
  }

  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  
  const customer = await repo.getCustomer(customerId);
  const rawAgreements = await repo.getAgreementsByCustomer(orgId, customerId);

  // Audience context: role = customer
  const audience = {
    role: 'customer' as const,
    id: customerId,
    orgId: orgId
  };

  // Resolve through the Presentation Engine
  const agreements = rawAgreements.map(agr => resolveEntityForAudience(agr, 'agreement', audience));

  return (
    <div>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Welcome back{customer?.profileData?.name ? `, ${customer.profileData.name}` : ''}</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>
        View and manage your active agreements and studio requests.
      </p>

      {agreements.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--color-border-subtle)', borderRadius: '8px' }}>
          No active agreements found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {agreements.map((agr: any) => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                      AGR-{agr.id.slice(0,8).toUpperCase()}
                    </span>
                    <StateBadge state={agr.status as any} label={agr.status} />
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                    {agr.terms?.deliverables || 'Standard Service'}
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Agreed Price</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                    {agr.terms?.price ? `${agr.terms.price} ${agr.terms.currency || 'NGN'}` : 'TBD'}
                  </div>
                </div>
              </div>

              {agr.instances && agr.instances.length > 0 && (
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '16px' }}>
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Progress</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {agr.instances.map((inst: any) => (
                      <div key={inst.id} style={{ 
                        padding: '12px', 
                        background: 'var(--color-surface-base)', 
                        borderRadius: '6px', 
                        border: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-family-mono)', marginRight: '12px' }}>
                            INST-{inst.id.slice(0,8).toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.9rem' }}>{inst.serviceId}</span>
                        </div>
                        {/* Notice how the customer register mapping will affect inst.status because of the Presentation Engine */}
                        <StateBadge state={inst.status as any} label={inst.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

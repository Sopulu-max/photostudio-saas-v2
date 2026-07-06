import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { MemoryDrawer } from '@/components/ontology/MemoryDrawer';
import { LineageEdge } from '@/components/ontology/LineageEdge';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function CustomerProfilePage({ params }: { params: { id: string } }) {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  let customer: any = null;
  let agreements: any[] = [];
  let events: any[] = [];
  let dbOffline = false;

  try {
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);

    const { data: cData, error: cErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .single();

    if (cErr) throw cErr;
    customer = {
      id: cData.id,
      organizationId: cData.organization_id,
      primaryIdentifier: cData.primary_identifier,
      profileData: cData.profile_data as Record<string, unknown>,
      status: cData.status as any,
      createdAt: cData.created_at,
      updatedAt: cData.updated_at,
    };

    const agrs = await repo.getAgreementsByOrganization(orgId);
    agreements = agrs.filter(a => a.customerId === customer.id);

    // Fetch event stream for customer
    const { data: eData } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', orgId)
      .eq('entity_id', customer.id)
      .order('created_at', { ascending: false });
      
    if (eData) events = eData;

  } catch (error) {
    console.error("Database connection failed", error);
    dbOffline = true;
  }

  if (dbOffline) return <DatabaseOfflineFallback />;
  if (!customer) return <div>Customer not found</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ 
        fontFamily: 'var(--font-family-serif)', 
        fontSize: '2rem', 
        marginBottom: '24px' 
      }}>
        Customer Profile
      </h1>

      <div style={{ 
        background: 'var(--color-surface-elevated)', 
        padding: '24px', 
        borderRadius: '8px',
        border: '1px solid var(--color-border-subtle)',
        marginBottom: '32px'
      }}>
        <EntitySignature type="customer" data={customer} />
      </div>

      <MemoryDrawer label="Event Stream" defaultExpanded={true}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.length === 0 ? (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No events recorded.</div>
          ) : (
            events.map((e: any) => (
              <div key={e.id} style={{
                fontSize: '0.8rem',
                padding: '8px',
                borderLeft: '2px solid var(--color-border-subtle)',
                background: 'var(--color-surface-base)'
              }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.event_type}</span>
                <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '8px' }}>
                  {new Date(e.created_at).toLocaleString()}
                </span>
                {Object.keys(e.payload || {}).length > 0 && (
                  <pre style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </MemoryDrawer>

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', fontFamily: 'var(--font-family-serif)' }}>Lineage Graph</h2>
        <div style={{ 
          background: 'var(--color-surface-base)', 
          padding: '24px', 
          borderRadius: '8px',
          border: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {agreements.length === 0 ? (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No lineage graph available.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <EntitySignature type="customer" data={customer} />
              <LineageEdge direction="vertical" length={24} />
              
              <div style={{ display: 'flex', flexDirection: 'row', gap: '0', alignItems: 'flex-start', position: 'relative' }}>
                {agreements.map((agr: any, index: number) => (
                  <div key={agr.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 12px' }}>
                    <div style={{ padding: '8px', background: 'var(--color-surface-elevated)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', zIndex: 1 }}>
                      <EntitySignature type="agreement" data={agr} />
                    </div>
                    {agr.instances && agr.instances.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <LineageEdge direction="vertical" length={24} status={agr.status} />
                        <div style={{ display: 'flex', position: 'relative', justifyContent: 'center' }}>
                          {/* Horizontal bus for instances */}
                          {agr.instances.length > 1 && (
                            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 0, display: 'flex' }}>
                              <LineageEdge direction="horizontal" length={(agr.instances.length - 1) * 100} status={agr.status} />
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '16px', paddingTop: '16px' }}>
                            {agr.instances.map((inst: any) => (
                              <div key={inst.id} style={{ padding: '8px', background: 'var(--color-surface-elevated)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', zIndex: 1 }}>
                                <EntitySignature type="service_instance" data={inst} scale="row" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

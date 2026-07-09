import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { StaffRepository } from '@/lib/domains/staff/repository';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';

export const dynamic = 'force-dynamic';

async function getStaffData(orgId: string | null) {
  let staff: any[] = [];
  let capabilities: any[] = [];
  let dbOffline = false;

  if (orgId) {
    try {
      const supabase = await createClient();
      const repo = new StaffRepository(supabase);
      
      staff = await repo.getStaffMembers(orgId);
      capabilities = await repo.getCapabilities(orgId);
    } catch (error) {
      console.error("Database connection failed", error);
      dbOffline = true;
    }
  }

  return { staff, capabilities, dbOffline };
}

export default async function StaffPage() {
  const orgId = await getOrgId();
  if (!orgId) return <div>Unauthorized</div>;

  const { staff, capabilities, dbOffline } = await getStaffData(orgId);

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}
      
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2rem', marginBottom: '8px' }}>
          Staff & Capabilities
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Manage your team and assign operational capabilities.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
        {/* Staff List */}
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Team Members</h2>
          {staff.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border-subtle)', borderRadius: '8px' }}>
              No staff members found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {staff.map(member => (
                <div key={member.id} style={{ 
                  background: 'var(--color-surface-elevated)', 
                  borderRadius: '8px', 
                  border: '1px solid var(--color-border-subtle)',
                  padding: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{member.name}</div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{member.email}</div>
                    </div>
                    <div style={{ background: 'var(--color-surface-base)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                      {member.role}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>Assigned Capabilities</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {member.staff_capabilities?.length === 0 ? (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>None</span>
                      ) : (
                        member.staff_capabilities?.map((sc: any) => (
                          <span key={sc.capabilities.id} style={{ 
                            background: 'var(--color-state-active)', 
                            color: 'white', 
                            padding: '4px 8px', 
                            borderRadius: '12px', 
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}>
                            {sc.capabilities.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Capabilities */}
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Available Capabilities</h2>
          {capabilities.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border-subtle)', borderRadius: '8px' }}>
              No capabilities defined.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {capabilities.map(cap => (
                <div key={cap.id} style={{ 
                  padding: '12px', 
                  background: 'var(--color-surface-base)', 
                  border: '1px solid var(--color-border-subtle)', 
                  borderRadius: '6px' 
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{cap.name}</div>
                  {cap.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{cap.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

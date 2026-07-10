import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { StaffRepository } from '@/lib/domains/staff/repository';
import { DatabaseOfflineFallback } from '@/components/layout/DatabaseOfflineFallback';
import { Invitation } from '@/components/ontology/Invitation';
import { AddStaffForm, AddCapabilityForm, AssignCapabilityControl } from './StaffControls';

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
    <div style={{ padding: '48px', maxWidth: '1100px', margin: '0 auto' }}>
      {dbOffline && <DatabaseOfflineFallback />}
      
      {/* Page Header */}
      <header style={{
        marginBottom: '48px',
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
          Staff &amp; Capabilities
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1rem' }}>
          Manage your team and assign operational capabilities.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '48px', alignItems: 'start' }}>
        {/* Staff List */}
        <section>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}>
            <h2 style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
              margin: 0,
            }}>
              Team Members ({staff.length})
            </h2>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <AddStaffForm />
          </div>

          {staff.length === 0 ? (
            <Invitation label="No staff members found" actionLabel="Add your first team member above" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {staff.map(member => (
                <div key={member.id} style={{ 
                  background: 'var(--color-surface-elevated)', 
                  borderRadius: '0', 
                  border: '1px solid var(--color-border-subtle)',
                  borderTop: '3px solid var(--color-border-focus)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-family-serif)',
                        fontWeight: 600,
                        fontSize: '1.4rem',
                        color: 'var(--color-text-primary)',
                        marginBottom: '4px'
                      }}>
                        {member.name}
                      </div>
                      <div style={{ 
                        color: 'var(--color-text-secondary)', 
                        fontSize: '0.85rem',
                        fontFamily: 'var(--font-family-mono)'
                      }}>
                        {member.email}
                      </div>
                    </div>
                    <div style={{ 
                      background: 'var(--color-surface-base)', 
                      border: '1px solid var(--color-border-subtle)',
                      padding: '4px 10px', 
                      borderRadius: '9999px', 
                      fontSize: '0.7rem', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)'
                    }}>
                      {member.role}
                    </div>
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '16px' }}>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-text-tertiary)', 
                      marginBottom: '12px',
                      fontWeight: 600
                    }}>
                      Assigned Capabilities
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      {member.staff_capabilities?.length === 0 ? (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>None assigned</span>
                      ) : (
                        member.staff_capabilities?.map((sc: any) => (
                          <span key={sc.capabilities.id} style={{ 
                            background: 'var(--color-surface-base)', 
                            border: '1px solid var(--color-border-subtle)',
                            color: 'var(--color-text-primary)', 
                            padding: '4px 10px', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}>
                            {sc.capabilities.name}
                          </span>
                        ))
                      )}
                    </div>
                    <AssignCapabilityControl staffId={member.id} capabilities={capabilities} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Global Capabilities */}
        <section>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            marginBottom: '20px',
          }}>
            Available Capabilities ({capabilities.length})
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <AddCapabilityForm />
          </div>

          {capabilities.length === 0 ? (
            <Invitation label="No capabilities defined" actionLabel="Define studio capabilities above" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {capabilities.map(cap => (
                <div key={cap.id} style={{ 
                  padding: '16px', 
                  background: 'var(--color-surface-elevated)', 
                  border: '1px solid var(--color-border-subtle)', 
                  borderRadius: 'var(--radius-md)' 
                }}>
                  <div style={{ 
                    fontWeight: 600, 
                    fontSize: '0.95rem',
                    color: 'var(--color-text-primary)',
                    marginBottom: cap.description ? '6px' : '0'
                  }}>
                    {cap.name}
                  </div>
                  {cap.description && (
                    <div style={{ 
                      fontSize: '0.85rem', 
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.5
                    }}>
                      {cap.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

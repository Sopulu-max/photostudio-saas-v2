import React from 'react';
import { getOrgId } from '@/lib/auth';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { createClient } from '@/lib/supabase/server';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge } from '@/components/ontology/StateBadge';
import { RequestActionControl } from '@/components/ontology/RequestActionControl';

export const dynamic = 'force-dynamic';

export default async function RequestsInboxPage() {
  const orgId = await getOrgId();
  
  if (!orgId) {
    return null; // Handled by layout intercept
  }

  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  const requests = await repo.getRequestsByOrganization(orgId);

  // Split into active (created) vs resolved (accepted, declined, etc.)
  const pendingRequests = requests.filter(r => r.status === 'created');
  const resolvedRequests = requests.filter(r => r.status !== 'created');

  return (
    <div style={{ padding: '48px', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '48px' }}>
        <h1 style={{ 
          fontFamily: 'var(--font-family-serif)', 
          fontSize: '2.5rem',
          fontWeight: 700,
          margin: '0 0 8px 0'
        }}>
          Inbox
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.1rem' }}>
          Review and process incoming requests from your storefront.
        </p>
      </header>

      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ 
          fontSize: '0.85rem', 
          textTransform: 'uppercase', 
          letterSpacing: '0.08em',
          color: 'var(--color-text-secondary)',
          fontWeight: 600,
          marginBottom: '20px',
        }}>
          Pending Requests ({pendingRequests.length})
        </h2>

        {pendingRequests.length === 0 ? (
          <div style={{
            background: 'var(--color-surface-glass)',
            border: '1px dashed var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '48px',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)'
          }}>
            Inbox is empty. No new booking requests.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{
                background: 'var(--color-surface-glass)',
                border: '1px solid var(--color-surface-glass-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '24px'
              }}>
                <div style={{ flex: 1 }}>
                  <EntitySignature type="request" data={req} scale="hero" />
                  
                  {req.notes && (
                    <div style={{
                      marginTop: '16px',
                      padding: '16px',
                      background: 'rgba(0,0,0,0.02)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.95rem',
                      lineHeight: 1.5,
                      color: 'var(--color-text-secondary)'
                    }}>
                      "{req.notes}"
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '150px' }}>
                  <StateBadge state={req.status as any} />
                  <RequestActionControl requestId={req.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {resolvedRequests.length > 0 && (
        <section>
          <h2 style={{ 
            fontSize: '0.85rem', 
            textTransform: 'uppercase', 
            letterSpacing: '0.08em',
            color: 'var(--color-text-secondary)',
            fontWeight: 600,
            marginBottom: '20px',
          }}>
            Recently Resolved
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {resolvedRequests.slice(0, 10).map(req => (
              <div key={req.id} style={{
                background: 'var(--color-surface-base)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <EntitySignature type="request" data={req} scale="row" />
                <StateBadge state={req.status as any} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

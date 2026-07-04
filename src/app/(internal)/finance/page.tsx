import React from 'react';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { StateBadge, KernelState } from '@/components/ontology/StateBadge';
import { Invitation } from '@/components/ontology/Invitation';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { AgreementDTO } from '@/lib/domains/kernel/types';
import { MockScenarios } from '@/lib/domains/kernel/mock-scenarios';
import { getOrgId } from '@/lib/auth';

async function getAgreements(orgId: string | null): Promise<AgreementDTO[]> {
  if (orgId) {
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const repo = new KernelRepository(supabase);
      const agreements = await repo.getAgreementsByOrganization(orgId);
      if (agreements.length > 0) return agreements;
    } catch {
      // Database unavailable — fall through to mock data
    }
  }
  
  // Graceful degradation: use mock fixtures
  const { passport, wedding } = MockScenarios;
  return [passport.agreement, wedding.agreement];
}

export default async function FinancePage() {
  const orgId = await getOrgId();
  const agreements = await getAgreements(orgId);

  return (
    <div style={{ padding: '40px' }}>

      {/* Page Header */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ 
          fontFamily: 'var(--font-family-serif)', 
          fontSize: '2rem', 
          marginBottom: '8px' 
        }}>
          Ledger
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Every agreement your studio has entered. The financial membrane between a request and the work.
        </p>
      </div>

      {/* Agreements Table */}
      {agreements.length === 0 ? (
        <Invitation label="No agreements yet. Accept a request to create one." />
      ) : (
        <div style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: '16px',
            padding: '14px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            fontSize: '0.8rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-secondary)',
          }}>
            <span>Agreement</span>
            <span>Status</span>
            <span>Terms</span>
            <span>Instances</span>
          </div>

          {/* Agreement Rows */}
          {agreements.map(agr => {
            const price = agr.terms?.price;
            const currency = agr.terms?.currency || '';
            const instanceCount = agr.instances?.length ?? 0;
            
            return (
              <div key={agr.id} style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                gap: '16px',
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-border-subtle)',
                alignItems: 'center',
                transition: 'background var(--transition-fast)',
              }}>
                {/* Agreement Signature */}
                <EntitySignature type="agreement" data={agr} scale="row" />
                
                {/* Status */}
                <div>
                  <StateBadge state={agr.status} />
                </div>
                
                {/* Terms — showing price if available */}
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-family-sans)' }}>
                  {price != null 
                    ? `${currency} ${Number(price).toLocaleString()}`
                    : <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>—</span>
                  }
                </div>
                
                {/* Instance Count */}
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: instanceCount > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' 
                }}>
                  {instanceCount > 0 
                    ? `${instanceCount} instance${instanceCount > 1 ? 's' : ''}`
                    : 'None'
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

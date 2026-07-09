import React from 'react';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { globalSchemaRegistry } from '@/lib/domains/presentation/registry';
import { IdentityEditor } from './IdentityEditor';

export const dynamic = 'force-dynamic';

export default async function IdentityPage() {
  const orgId = await getOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  
  let identity = await repo.getIdentity(orgId);
  if (!identity) {
    // Fallback if not seeded
    identity = {
      organizationId: orgId,
      name: 'Unnamed Studio',
      logoUrl: null,
      brandColors: { primary: '#a855f7' },
      typography: { heading: 'serif', body: 'sans' },
      contactData: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const schema = globalSchemaRegistry.getEntitySchema('Identity');

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '20px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2.5rem', margin: '0 0 8px 0' }}>Identity Surface</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.1rem' }}>
          Shape the face your studio presents to the world. Every edit updates the reality globally.
        </p>
      </header>

      <div style={{ 
        background: 'var(--color-surface-elevated)', 
        borderRadius: '16px', 
        padding: '40px', 
        border: '1px solid var(--color-border-subtle)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
      }}>
        {schema && <IdentityEditor identityDto={identity} schema={schema} />}
      </div>
    </div>
  );
}

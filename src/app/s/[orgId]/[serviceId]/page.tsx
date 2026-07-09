import React from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { resolveEntityForAudience } from '@/lib/domains/presentation/resolver';
import { globalSchemaRegistry } from '@/lib/domains/presentation/registry';
import { AttributeRenderer } from '@/components/presentation/AttributeRenderer';
import { AudienceContext } from '@/lib/domains/presentation/types';

export const dynamic = 'force-dynamic';

export default async function PublicServiceProjectionPage({ params }: { params: { orgId: string, serviceId: string } }) {
  const { orgId, serviceId } = await params;
  
  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  
  // 1. Fetch Identity (for branding/theming context)
  const identity = await repo.getIdentity(orgId);
  if (!identity) return notFound();
  
  const primaryColor = (identity.brandColors && typeof identity.brandColors === 'object' && 'primary' in identity.brandColors) 
    ? (identity.brandColors.primary as string) 
    : '#a855f7';

  // 2. Fetch Service
  const { data: service, error } = await supabase.from('services').select('*').eq('id', serviceId).eq('organization_id', orgId).single();
  if (error || !service) return notFound();

  // 3. Resolve for Public Audience (F1/F2 Laws Enforced)
  const audience: AudienceContext = { role: 'public', id: null };
  const resolvedService = resolveEntityForAudience(service, 'Service', audience);

  const schema = globalSchemaRegistry.getEntitySchema('Service');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', color: 'var(--color-text)', display: 'flex', flexDirection: 'column' }}>
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --color-primary: ${primaryColor};
        }
      `}} />

      <header style={{ padding: '24px 40px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {identity.logoUrl ? (
          <img src={identity.logoUrl} alt={identity.name} style={{ height: '40px', objectFit: 'contain' }} />
        ) : (
          <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '1.5rem', margin: 0 }}>{identity.name}</h1>
        )}
      </header>

      <main style={{ flex: 1, padding: '60px 40px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-family-serif)', margin: '0 0 16px 0' }}>
          {resolvedService.name || 'Unnamed Service'}
        </h2>
        
        {resolvedService.description && (
          <p style={{ fontSize: '1.2rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '40px' }}>
            {resolvedService.description}
          </p>
        )}

        <div style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-subtle)', borderRadius: '16px', padding: '32px' }}>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: '0 0 24px 0', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            Service Details
          </h3>
          
          {schema && Object.values(schema.attributes).map(attr => {
            // Skip fields that were stripped by the resolver (they will be undefined)
            if (resolvedService[attr.key] === undefined) return null;
            // Skip redundant fields already shown in hero
            if (attr.key === 'name' || attr.key === 'description') return null;

            return (
              <AttributeRenderer
                key={attr.key}
                schema={attr}
                value={resolvedService[attr.key]}
                isEditMode={false} // Read-only public view
              />
            );
          })}

          <div style={{ marginTop: '40px' }}>
            <button style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              transition: 'opacity var(--transition-fast)'
            }}>
              Request this Service
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

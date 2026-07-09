'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { globalSchemaRegistry } from '@/lib/domains/presentation/registry';
import { AttributeRenderer } from '@/components/presentation/AttributeRenderer';
import { modifyServiceAction } from '@/app/actions/kernel';
import { createClient } from '@/lib/supabase/client';

export default function ServiceTendingPage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.serviceId as string;
  const [service, setService] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchService = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('services').select('*').eq('id', serviceId).single();
      setService(data);
      setLoading(false);
    };
    fetchService();
  }, [serviceId]);

  if (loading) return <div style={{ padding: '40px' }}>Loading...</div>;
  if (!service) return <div style={{ padding: '40px' }}>Service not found</div>;

  const handleUpdate = async (key: string, newValue: any) => {
    // Optimistic update
    setService((prev: any) => ({ ...prev, [key]: newValue }));
    
    // Map schema keys to column names or JSON objects
    const changes: Record<string, any> = {};
    if (key === 'name' || key === 'description' || key === 'status') {
      changes[key] = newValue;
    } else if (key === 'pricingRules') {
      changes.pricingRules = newValue;
    } else if (key === 'requiredFields') {
      changes.requiredFields = newValue;
    }

    const res = await modifyServiceAction(serviceId, changes);
    if (!res.success) {
      alert('Failed to update: ' + res.error);
    }
  };

  const schema = globalSchemaRegistry.getEntitySchema('Service');

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => router.push('/catalog')} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}>
          ← Back to Catalog
        </button>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Service Tending
        </span>
      </header>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: '16px', padding: '32px' }}>
        <h1 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', fontWeight: 600 }}>{service.name || 'Unnamed Service'}</h1>
        
        {schema && Object.values(schema.attributes).map(attr => {
          // Skip internal/readonly fields for inline tending
          if (attr.key === 'id' || attr.key === 'organizationId' || attr.key === 'createdAt' || attr.key === 'updatedAt') return null;
          
          return (
            <AttributeRenderer
              key={attr.key}
              schema={attr}
              value={service[attr.key]}
              isEditMode={true}
              onUpdate={handleUpdate}
            />
          );
        })}
      </div>
    </div>
  );
}

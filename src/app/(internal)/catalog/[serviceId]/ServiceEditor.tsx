'use client';

import React, { useState } from 'react';
import { AttributeRenderer } from '@/components/presentation/AttributeRenderer';
import { modifyServiceAction } from '@/app/actions/kernel';
import { saveFacingConfig } from '@/app/actions/presentation';
import { Eye, EyeOff, Shield } from 'lucide-react';

export function ServiceEditor({ serviceDto, schema, facingConfig: initialFacingConfig, orgId }: { serviceDto: any, schema: any, facingConfig: any, orgId: string }) {
  const [facingConfig, setFacingConfig] = useState(initialFacingConfig || {});
  const [lens, setLens] = useState<'staff' | 'public'>('staff');

  const handleUpdate = async (key: string, newValue: any) => {
    // Map attribute keys to backend update fields
    const updates: Record<string, any> = {};
    if (key === 'name') updates.name = newValue;
    if (key === 'description') updates.description = newValue;
    if (key === 'pricingRules.basePrice') {
      updates.pricingRules = { ...serviceDto.pricingRules, basePrice: newValue };
    }

    if (Object.keys(updates).length > 0) {
      await modifyServiceAction(serviceDto.id, updates);
    }
  };

  const toggleExposure = async (key: string) => {
    const current = facingConfig[key];
    const defaultExposed = schema.attributes[key]?.facingTier === 'configurable_open';
    const isExposed = current ?? defaultExposed;
    
    const newConfig = { ...facingConfig, [key]: !isExposed };
    setFacingConfig(newConfig);
    await saveFacingConfig(orgId, newConfig);
  };

  const renderAttributeRow = (key: string, label?: string, type?: string) => {
    const attrSchema = schema.attributes[key] || { key, label, type, facingTier: 'configurable_closed' };
    const defaultExposed = attrSchema.facingTier === 'configurable_open';
    const isExposed = facingConfig[key] ?? defaultExposed;
    
    // Audience Lens evaluation
    if (lens === 'public' && !isExposed && attrSchema.facingTier.startsWith('configurable_')) return null;
    if (lens === 'public' && attrSchema.facingTier === 'never_external') return null;

    return (
      <div key={key} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <AttributeRenderer 
            schema={attrSchema} 
            value={key.includes('.') ? key.split('.').reduce((o: any, i) => o?.[i], serviceDto) : serviceDto[key]} 
            isEditMode={lens === 'staff'} 
            onUpdate={handleUpdate} 
          />
        </div>
        
        {/* Exposure Toggle (only in staff mode for configurable tiers) */}
        {lens === 'staff' && attrSchema.facingTier.startsWith('configurable_') && (
          <button 
            onClick={() => toggleExposure(key)}
            style={{
              padding: '8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isExposed ? 'var(--color-state-active)' : 'var(--color-text-tertiary)',
              marginTop: '28px' // align with input roughly
            }}
            title={isExposed ? 'Visible to public' : 'Hidden from public'}
          >
            {isExposed ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        )}
        
        {lens === 'staff' && attrSchema.facingTier === 'never_external' && (
          <div style={{ marginTop: '30px', color: 'var(--color-text-tertiary)' }} title="Internal only (Never External)">
            <Shield size={18} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* Audience Lens Toggle */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        margin: '0 0 16px 0', 
        paddingBottom: '16px', 
        borderBottom: '1px solid var(--color-border-subtle)' 
      }}>
        <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: 0 }}>
          Service Configuration
        </h3>
        
        <div style={{ display: 'flex', background: 'var(--color-surface-base)', borderRadius: '6px', padding: '4px', border: '1px solid var(--color-border-subtle)' }}>
          <button
            onClick={() => setLens('staff')}
            style={{
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              background: lens === 'staff' ? 'var(--color-surface-elevated)' : 'transparent',
              color: lens === 'staff' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              boxShadow: lens === 'staff' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Staff Edit
          </button>
          <button
            onClick={() => setLens('public')}
            style={{
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              background: lens === 'public' ? 'var(--color-surface-elevated)' : 'transparent',
              color: lens === 'public' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              boxShadow: lens === 'public' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Public Preview
          </button>
        </div>
      </div>

      {renderAttributeRow('name')}
      {renderAttributeRow('description')}
      
      <div style={{ marginTop: '24px' }}>
        <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Pricing</h4>
        {renderAttributeRow('pricingRules.basePrice', 'Base Price (₦)', 'number')}
      </div>
      
    </div>
  );
}

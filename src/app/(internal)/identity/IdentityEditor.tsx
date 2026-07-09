'use client';

import React from 'react';
import { AttributeRenderer } from '@/components/presentation/AttributeRenderer';
import { enrichIdentityAction } from '@/app/actions/kernel';

export function IdentityEditor({ identityDto, schema }: { identityDto: any, schema: any }) {
  const handleUpdate = async (key: string, newValue: any) => {
    const updates: Record<string, any> = {};
    if (key === 'name') updates.name = newValue;
    if (key === 'logoUrl') updates.logoUrl = newValue;
    
    // For nested fields like brandColors.primary
    if (key === 'brandColors.primary') {
      updates.brandColors = { ...identityDto.brandColors, primary: newValue };
    }
    if (key === 'typography.heading') {
      updates.typography = { ...identityDto.typography, heading: newValue };
    }
    if (key === 'contactData.email') {
      updates.contactData = { ...identityDto.contactData, email: newValue };
    }

    if (Object.keys(updates).length > 0) {
      await enrichIdentityAction(updates);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: '0 0 16px 0', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        Core Identity
      </h3>

      <AttributeRenderer 
        schema={schema.attributes['name']} 
        value={identityDto.name} 
        isEditMode={true} 
        onUpdate={handleUpdate} 
      />
      <AttributeRenderer 
        schema={schema.attributes['logoUrl']} 
        value={identityDto.logoUrl} 
        isEditMode={true} 
        onUpdate={handleUpdate} 
      />

      <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: '24px 0 16px 0', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        Brand Theming
      </h3>

      {/* Exposing specific nested attributes via dynamic AttributeRenderer configuration */}
      <AttributeRenderer 
        schema={{ key: 'brandColors.primary', label: 'Primary Brand Color (Hex)', type: 'string', facingTier: 'configurable_open' }} 
        value={identityDto.brandColors?.primary} 
        isEditMode={true} 
        onUpdate={handleUpdate} 
      />
      <AttributeRenderer 
        schema={{ key: 'typography.heading', label: 'Heading Font (serif/sans)', type: 'string', facingTier: 'configurable_open' }} 
        value={identityDto.typography?.heading} 
        isEditMode={true} 
        onUpdate={handleUpdate} 
      />

      <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: '24px 0 16px 0', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        Contact
      </h3>

      <AttributeRenderer 
        schema={{ key: 'contactData.email', label: 'Public Email', type: 'string', facingTier: 'configurable_open' }} 
        value={identityDto.contactData?.email} 
        isEditMode={true} 
        onUpdate={handleUpdate} 
      />

    </div>
  );
}

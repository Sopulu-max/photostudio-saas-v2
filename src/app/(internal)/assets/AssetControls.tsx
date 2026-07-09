"use client";

import React, { useState, useTransition } from 'react';
import { registerAssetAction, produceOutcomeAction, deliverOutcomeAction } from '@/app/actions/kernel';
import { createClient } from '@/lib/supabase/client';

interface AssetControlsProps {
  orgId: string;
  activeInstances?: any[];
  deliverOnly?: boolean;
  assetId?: string;
}

export function AssetControls({ orgId, activeInstances = [], deliverOnly = false, assetId }: AssetControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<'provided' | 'produced'>('produced');
  const [contentRef, setContentRef] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [customerId, setCustomerId] = useState('');
  
  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [usageRights, setUsageRights] = useState('Personal Use');

  const supabase = createClient();

  if (deliverOnly && assetId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input 
          value={usageRights}
          onChange={(e) => setUsageRights(e.target.value)}
          placeholder="Usage Rights (e.g. Commercial, Personal)"
          style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }}
        />
        <button 
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await deliverOutcomeAction(assetId, { terms: usageRights });
            });
          }}
          style={{
            background: 'var(--color-state-active)',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.6 : 1,
            fontSize: '0.8rem',
            fontWeight: 600
          }}
        >
          Deliver Asset
        </button>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalContentRef = contentRef;

    // Handle File Upload
    if (file) {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${orgId}/${fileName}`;

      const { error } = await supabase.storage
        .from('studio_assets')
        .upload(filePath, file);

      setIsUploading(false);

      if (error) {
        alert(`Upload failed: ${error.message}`);
        return;
      }
      
      finalContentRef = `storage:studio_assets/${filePath}`;
    }

    startTransition(async () => {
      if (type === 'provided') {
        await registerAssetAction({ customerId, instanceId, contentReference: finalContentRef });
      } else {
        await produceOutcomeAction(instanceId, finalContentRef);
      }
      setContentRef('');
      setFile(null);
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '16px' }}>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.9rem' }}>
          <input type="radio" checked={type === 'produced'} onChange={() => setType('produced')} />
          Produce Outcome
        </label>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.9rem' }}>
          <input type="radio" checked={type === 'provided'} onChange={() => setType('provided')} />
          Provided Asset
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Upload File</label>
        <input 
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border-subtle)' }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>OR</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border-subtle)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Manual Content Reference</label>
        <input 
          value={contentRef}
          onChange={(e) => setContentRef(e.target.value)}
          placeholder={type === 'provided' ? "e.g., usb:sandra_photos" : "e.g., gdrive:wedding_album_01"}
          disabled={!!file}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)', opacity: file ? 0.5 : 1 }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Target Instance</label>
        <select 
          required={type === 'produced'}
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)' }}
        >
          <option value="">Select instance...</option>
          {activeInstances.map(i => (
            <option key={i.id} value={i.id}>
              {i.service_id} (ID: {i.id.slice(0, 8)})
            </option>
          ))}
        </select>
      </div>

      {type === 'provided' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Customer ID (Required)</label>
          <input 
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Customer UUID"
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)' }}
          />
        </div>
      )}

      <button 
        type="submit" 
        disabled={isPending || isUploading || (!contentRef && !file) || (type === 'produced' && !instanceId) || (type === 'provided' && !customerId)}
        style={{
          background: 'var(--color-text-primary)',
          color: 'var(--color-surface-base)',
          border: 'none',
          padding: '10px 16px',
          borderRadius: '4px',
          cursor: (isPending || isUploading) ? 'wait' : 'pointer',
          opacity: (isPending || isUploading) ? 0.6 : 1,
          fontSize: '0.85rem',
          fontWeight: 600,
          marginTop: '8px'
        }}
      >
        {isUploading ? 'Uploading...' : isPending ? 'Processing...' : (type === 'provided' ? 'Register Asset' : 'Produce Outcome')}
      </button>
    </form>
  );
}

"use client";

import React, { useState, useTransition } from 'react';
import { registerAssetAction, produceOutcomeAction, deliverOutcomeAction } from '@/app/actions/kernel';

interface AssetControlsProps {
  activeInstances?: any[];
  deliverOnly?: boolean;
  assetId?: string;
}

export function AssetControls({ activeInstances = [], deliverOnly = false, assetId }: AssetControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<'provided' | 'produced'>('produced');
  const [contentRef, setContentRef] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [customerId, setCustomerId] = useState('');

  const [usageRights, setUsageRights] = useState('Personal Use');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      if (type === 'provided') {
        await registerAssetAction({ customerId, instanceId, contentReference: contentRef });
      } else {
        await produceOutcomeAction(instanceId, contentRef);
      }
      setContentRef('');
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
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Content Reference</label>
        <input 
          required
          value={contentRef}
          onChange={(e) => setContentRef(e.target.value)}
          placeholder={type === 'provided' ? "e.g., usb:sandra_photos" : "e.g., gdrive:wedding_album_01"}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)' }}
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
        disabled={isPending || !contentRef || (type === 'produced' && !instanceId) || (type === 'provided' && !customerId)}
        style={{
          background: 'var(--color-text-primary)',
          color: 'var(--color-surface-base)',
          border: 'none',
          padding: '10px 16px',
          borderRadius: '4px',
          cursor: isPending ? 'wait' : 'pointer',
          opacity: isPending ? 0.6 : 1,
          fontSize: '0.85rem',
          fontWeight: 600,
          marginTop: '8px'
        }}
      >
        {isPending ? 'Processing...' : (type === 'provided' ? 'Register Asset' : 'Produce Outcome')}
      </button>
    </form>
  );
}

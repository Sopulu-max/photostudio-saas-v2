'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAssetStatus } from '@/lib/actions/assets';
import type { AssetStatus } from '@/lib/types/engine';

type Option = { status: AssetStatus; label: string; variant: 'primary' | 'secondary' };

// Mirrors ASSET_TRANSITIONS in src/lib/actions/assets.ts
const NEXT_ACTIONS: Record<string, Option[]> = {
  registered: [{ status: 'available', label: 'Make Available', variant: 'primary' }],
  available:  [
    { status: 'in_use', label: 'Mark In Use', variant: 'primary' },
    { status: 'retained', label: 'Retain', variant: 'secondary' },
  ],
  in_use:     [
    { status: 'available', label: 'Return to Available', variant: 'secondary' },
    { status: 'retained', label: 'Retain', variant: 'primary' },
  ],
  retained:   [{ status: 'released', label: 'Release', variant: 'secondary' }],
  released:   [],
};

export function AssetActions({
  assetId,
  currentStatus,
  organizationId,
  actorId,
}: {
  assetId: string;
  currentStatus: AssetStatus;
  organizationId: string;
  actorId: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const options = NEXT_ACTIONS[currentStatus] || [];

  if (options.length === 0) return null;

  async function handleChange(newStatus: AssetStatus) {
    setIsPending(true);
    try {
      await updateAssetStatus(assetId, organizationId, newStatus, actorId);
      router.refresh();
    } catch (error) {
      console.error('Failed to update asset status:', error);
      alert('Failed to update asset status.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
      {options.map((o) => (
        <button
          key={o.status}
          onClick={() => handleChange(o.status)}
          disabled={isPending}
          className={`q-btn q-btn-${o.variant}`}
          style={{ fontSize: '0.8rem', opacity: isPending ? 0.7 : 1 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { registerAsset } from '@/lib/actions/assets';
import { UploadCloud } from 'lucide-react';

export function AssetUploadClient({ orgId, actorId }: { orgId: string, actorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    origin: 'produced' as 'produced' | 'provided',
    type: 'image/jpeg',
    fileReference: '',
  });
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await registerAsset({
          organizationId: orgId,
          origin: formData.origin,
          type: formData.type,
          fileReference: formData.fileReference,
          actorId: actorId
        });
        
        setIsModalOpen(false);
        setFormData({ origin: 'produced', type: 'image/jpeg', fileReference: '' });
        router.refresh();
      } catch (e) {
        console.error('Failed to register asset', e);
        alert('Failed to register asset.');
      }
    });
  };

  return (
    <>
      <button 
        className="q-btn q-btn-primary" 
        onClick={() => setIsModalOpen(true)}
      >
        <UploadCloud size={18} style={{ marginRight: '8px' }} />
        Upload Asset
      </button>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="q-card" style={{ width: '400px', padding: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0' }}>Register Asset</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="q-label">Origin</label>
                <select 
                  className="q-input" 
                  value={formData.origin}
                  onChange={(e) => setFormData({...formData, origin: e.target.value as any})}
                >
                  <option value="produced">Produced (By Studio)</option>
                  <option value="provided">Provided (By Client)</option>
                </select>
              </div>
              <div>
                <label className="q-label">Type / MIME</label>
                <input 
                  type="text" 
                  className="q-input" 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  placeholder="e.g., image/jpeg, video/mp4"
                  required
                />
              </div>
              <div>
                <label className="q-label">File Reference</label>
                <input 
                  type="text" 
                  className="q-input" 
                  value={formData.fileReference}
                  onChange={(e) => setFormData({...formData, fileReference: e.target.value})}
                  placeholder="e.g., s3://bucket/filename.jpg"
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="q-btn q-btn-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="q-btn q-btn-primary" disabled={isPending}>
                  {isPending ? 'Uploading...' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

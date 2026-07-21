'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UploadCloud, File as FileIcon, X, CheckCircle } from 'lucide-react';

interface UploaderProps {
  workflowId: string;
  onUploadComplete?: (path: string) => void;
}

export function Uploader({ workflowId, onUploadComplete }: UploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSuccess(false);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    const supabase = createClient();
    
    // Create a path: e.g. "workflow_id/timestamp_filename"
    const filePath = `${workflowId}/${Date.now()}_${file.name}`;

    try {
      const { data, error } = await supabase.storage
        .from('assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      setSuccess(true);
      if (onUploadComplete) onUploadComplete(filePath);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setProgress(100);
    }
  };

  return (
    <div className="q-card" style={{ padding: '24px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Upload Asset</h3>
      
      {!file ? (
        <label style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '32px',
          border: '2px dashed var(--q-color-ink-300)',
          borderRadius: '8px',
          cursor: 'pointer',
          backgroundColor: '#fafafa',
          transition: 'background-color 0.2s'
        }}>
          <UploadCloud size={32} color="var(--q-color-ink-400)" style={{ marginBottom: '12px' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--q-color-ink-600)' }}>
            Click or drag file to upload
          </span>
          <input type="file" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid var(--q-color-ink-200)', borderRadius: '6px' }}>
            <FileIcon size={24} color="var(--q-color-ink-500)" />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {file.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)' }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            {!uploading && !success && (
              <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="var(--q-color-ink-400)" />
              </button>
            )}
            {success && <CheckCircle size={20} color="green" />}
          </div>

          {error && <div style={{ color: 'red', fontSize: '0.875rem' }}>{error}</div>}

          {!success && (
            <button 
              onClick={handleUpload} 
              disabled={uploading}
              className="q-btn q-btn-primary" 
              style={{ width: '100%' }}
            >
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BuilderContext, BlockInstance } from './types';
import { Blocks } from './BlockRegistry';
import BuilderSidebar from './BuilderSidebar';
import BuilderCanvas from './BuilderCanvas';

interface BuilderLayoutProps {
  context: BuilderContext;
  title: string;
  backHref: string;
  initialInstances?: BlockInstance[];
  onCommit: (instances: BlockInstance[]) => Promise<void>;
  isSubmitting?: boolean;
}

export default function BuilderLayout({
  context,
  title,
  backHref,
  initialInstances = [],
  onCommit,
  isSubmitting = false
}: BuilderLayoutProps) {
  const router = useRouter();
  const [instances, setInstances] = useState<BlockInstance[]>(initialInstances);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const handleAddBlock = (type: string) => {
    const def = Blocks[type];
    if (!def) return;
    const newInstance: BlockInstance = {
      id: `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      data: { ...def.defaultData }
    };
    setInstances([...instances, newInstance]);
    setSelectedInstanceId(newInstance.id);
  };

  const handleUpdateBlock = (id: string, data: any) => {
    setInstances(instances.map(inst => inst.id === id ? { ...inst, data } : inst));
  };

  const handleDeleteBlock = (id: string) => {
    setInstances(instances.filter(inst => inst.id !== id));
    if (selectedInstanceId === id) setSelectedInstanceId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
      {/* Top Navbar Chrome */}
      <header style={{
        height: '56px',
        background: 'var(--color-surface-elevated)',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => router.push(backHref)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {title}
          </div>
          <div style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-surface-base)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)' }}>
            {context}
          </div>
        </div>

        <div>
          <button
            onClick={() => onCommit(instances)}
            disabled={isSubmitting}
            style={{
              background: 'var(--color-text-primary)',
              color: 'var(--color-surface-base)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting && <Loader2 size={16} className="spin" />}
            {isSubmitting ? 'Saving...' : 'Publish'}
          </button>
        </div>
      </header>

      {/* Main Builder Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <BuilderSidebar
          context={context}
          selectedInstanceId={selectedInstanceId}
          instances={instances}
          onAddBlock={handleAddBlock}
          onUpdateBlock={handleUpdateBlock}
        />

        {/* Canvas Area */}
        <BuilderCanvas
          instances={instances}
          selectedInstanceId={selectedInstanceId}
          onSelect={setSelectedInstanceId}
          onReorder={setInstances}
          onDelete={handleDeleteBlock}
        />
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}} />
    </div>
  );
}

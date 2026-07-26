'use client';

import React, { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { saveLayout, publishLayout } from '@/lib/actions/layouts';
import { VisualNode } from '@/components/VisualEngine/Renderer';
import { makeBlock, BlockType } from '@/components/VisualEngine/blocks';
import { BuilderCanvas } from '@/components/VisualEngine/BuilderCanvas';
import { Sidebar } from '@/components/VisualEngine/Sidebar';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function findNode(root: VisualNode, id: string): VisualNode | null {
  if (root.id === id) return root;
  if (root.children) {
    for (let child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

function replaceNode(root: VisualNode, newNode: VisualNode): VisualNode {
  if (root.id === newNode.id) return newNode;
  if (root.children) {
    return {
      ...root,
      children: root.children.map(c => replaceNode(c, newNode))
    };
  }
  return root;
}

function removeNode(root: VisualNode, id: string): VisualNode {
  if (!root.children) return root;
  return {
    ...root,
    children: root.children.filter(c => c.id !== id).map(c => removeNode(c, id)),
  };
}

// The fields a studio can bind blocks to, per subject type. Friendly labels
// map to the dot-paths the Renderer resolves against the live record.
const BINDABLE_FIELDS: Record<string, { label: string; path: string }[]> = {
  service: [
    { label: 'Service name', path: 'service.name' },
    { label: 'Description', path: 'service.description' },
    { label: 'Price', path: 'service.pricing.base_price' },
    { label: 'Currency', path: 'service.pricing.currency' },
  ],
};

export function LayoutBuilder({ initialLayout, sampleData = {} }: { initialLayout: any; sampleData?: Record<string, any> }) {
  const fields = BINDABLE_FIELDS[initialLayout.subject_type as string] || [];
  const [layoutData, setLayoutData] = useState<VisualNode>(
    initialLayout.layout_data?.root || {
      id: 'root',
      type: 'Container',
      props: { style: { padding: '24px', background: 'var(--q-color-paper)', minHeight: '100%' } },
      children: []
    }
  );
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id.toString().startsWith('tool-')) {
      // Adding a new block, with its premium Lumen defaults from the registry.
      const base = makeBlock(active.data.current?.type as BlockType);
      if (!base) return;
      const newNode: VisualNode = { id: `node-${generateId()}`, ...base };

      // Append to the page root for now; drop-into-container is a later brick.
      setLayoutData(prev => ({
        ...prev,
        children: [...(prev.children || []), newNode]
      }));
      setActiveId(newNode.id);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveLayout(initialLayout.id, layoutData);
      alert('Saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save layout.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await publishLayout(initialLayout.id, layoutData);
      alert('Published! Your page is now live.');
    } catch (err) {
      console.error(err);
      alert('Failed to publish.');
    } finally {
      setIsPublishing(false);
    }
  };

  const deleteNode = (id: string) => {
    setLayoutData(prev => removeNode(prev, id));
    setActiveId(null);
  };

  const activeNode = activeId ? findNode(layoutData, activeId) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', background: 'var(--q-color-paper-base)' }}>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '1px solid var(--q-color-ink-200)', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a
            href={initialLayout.subject_type === 'service' && initialLayout.subject_id ? `/services/${initialLayout.subject_id}` : '/visual-layouts'}
            className="q-btn q-btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
          >
            ← Exit
          </a>
          <div>
            <h1 className="q-page-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Page Designer</h1>
            <p className="q-page-subtitle" style={{ fontSize: '0.72rem', marginBottom: 0 }}>Editing: {initialLayout.name || 'Untitled Layout'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button onClick={handleSave} disabled={isSaving || isPublishing} className="q-btn q-btn-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            {isSaving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={handlePublish} disabled={isSaving || isPublishing} className="q-btn q-btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {/* Main Canvas Area */}
          <BuilderCanvas rootNode={layoutData} activeId={activeId} onSelectNode={setActiveId} dataContext={sampleData} />
          
          {/* Properties & Toolbox Sidebar */}
          <Sidebar
            activeNode={activeNode}
            onUpdateNode={(updated) => setLayoutData(replaceNode(layoutData, updated))}
            onDelete={deleteNode}
            fields={fields}
          />
        </DndContext>
      </div>
    </div>
  );
}

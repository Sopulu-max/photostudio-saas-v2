'use client';

import React, { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { supabaseAdmin } from '@/lib/supabase/admin'; 
import { VisualNode } from '@/components/VisualEngine/Renderer';
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

export function LayoutBuilder({ initialLayout }: { initialLayout: any }) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id.toString().startsWith('tool-')) {
      // Adding a new component
      const type = active.data.current?.type as 'Text' | 'Button' | 'Container' | 'Image';
      const newNode: VisualNode = {
        id: `node-${generateId()}`,
        type,
        props: type === 'Text' ? { text: 'New Text' } : 
               type === 'Button' ? { text: 'New Button' } : 
               type === 'Container' ? { style: { minHeight: '50px', border: '1px solid #ccc' } } : {},
        children: type === 'Container' ? [] : undefined
      };

      // Simplistic drop logic: always append to root for this MVP
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
      await supabaseAdmin
        .from('visual_layouts')
        .update({ layout_data: { root: layoutData } })
        .eq('id', initialLayout.id);
      alert('Saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save layout.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeNode = activeId ? findNode(layoutData, activeId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--q-color-ink-200)', marginBottom: 0 }}>
        <div>
          <h1 className="q-page-title" style={{ fontSize: '1.25rem', marginBottom: 0 }}>Canvas Editor</h1>
          <p className="q-page-subtitle" style={{ fontSize: '0.75rem', marginBottom: 0 }}>Editing: {initialLayout.name || 'Untitled Layout'}</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="q-btn q-btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
          {isSaving ? 'Saving...' : 'Save Layout'}
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {/* Main Canvas Area */}
          <BuilderCanvas rootNode={layoutData} activeId={activeId} onSelectNode={setActiveId} />
          
          {/* Properties & Toolbox Sidebar */}
          <Sidebar 
            activeNode={activeNode} 
            onUpdateNode={(updated) => setLayoutData(replaceNode(layoutData, updated))} 
          />
        </DndContext>
      </div>
    </div>
  );
}

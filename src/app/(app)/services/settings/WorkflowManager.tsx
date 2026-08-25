'use client';

import React, { useState, useTransition } from 'react';
import { Plus, CheckCircle2, Trash2 } from 'lucide-react';
import { WorkflowEditor, WorkflowInput } from '../[id]/WorkflowEditor';

export function WorkflowManager({
  domains,
  workflowsByDomain,
  roleOptions,
  onSave,
  onDelete,
}: {
  domains: { id: string; name: string }[];
  workflowsByDomain: Record<string, any[]>;
  roleOptions?: string[];
  onSave: (domainId: string, workflow: WorkflowInput) => Promise<{ ok: boolean }>;
  onDelete: (workflowId: string) => Promise<{ ok: boolean }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowInput | null>(null);
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);

  const handleEdit = (domainId: string, wf: any) => {
    setEditingId(wf.id);
    setEditingDomainId(domainId);
    setEditingWorkflow({
      name: wf.name,
      tasks: wf.tasks.map((t: any) => ({ name: t.name, description: t.description, roleName: t.roleName })),
    });
  };

  const handleCreate = (domainId: string) => {
    setEditingId('new');
    setEditingDomainId(domainId);
    setEditingWorkflow({ name: '', tasks: [{ name: '' }] });
  };

  const handleSave = () => {
    if (!editingDomainId || !editingWorkflow || !editingWorkflow.name.trim()) return;
    startTransition(async () => {
      try {
        await onSave(editingDomainId, editingWorkflow);
        setEditingId(null);
        setEditingDomainId(null);
        setEditingWorkflow(null);
      } catch (e: any) {
        alert(e.message || 'Failed to save workflow');
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    startTransition(async () => {
      try {
        await onDelete(id);
      } catch (e: any) {
        alert(e.message || 'Failed to delete workflow');
      }
    });
  };

  if (editingId && editingWorkflow) {
    return (
      <div className="q-card q-section">
        <h3 className="q-section-title">Edit Workflow</h3>
        <WorkflowEditor workflow={editingWorkflow} onChange={setEditingWorkflow} roleOptions={roleOptions} />
        <div className="q-row" style={{ marginTop: '16px' }}>
          <button className="q-btn q-btn-primary" onClick={handleSave} disabled={isPending || !editingWorkflow.name.trim()}>
            <CheckCircle2 size={16} style={{ marginRight: '8px' }} />
            {isPending ? 'Saving...' : 'Save Workflow'}
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => setEditingId(null)} disabled={isPending}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-stack">
      {domains.map(d => {
        const wfs = workflowsByDomain[d.id] || [];
        return (
          <div key={d.id} style={{ padding: '16px', background: 'var(--q-color-paper)', borderRadius: '8px', border: '1px solid var(--q-color-border)' }}>
            <div className="q-row q-row-between" style={{ alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ fontWeight: 600 }}>{d.name}</h4>
              <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => handleCreate(d.id)} disabled={isPending}>
                <Plus size={14} style={{ marginRight: '6px' }} />
                Add Workflow
              </button>
            </div>
            {wfs.length === 0 ? (
              <p className="q-meta-sm">No workflows defined for {d.name}.</p>
            ) : (
              <div className="q-stack" style={{ gap: '8px' }}>
                {wfs.map(wf => (
                  <div key={wf.id} className="q-panel q-row q-row-between" style={{ alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{wf.name}</div>
                      <div className="q-meta-sm">{wf.tasks.length} tasks</div>
                    </div>
                    <div className="q-row">
                      <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => handleEdit(d.id, wf)} disabled={isPending}>
                        Edit
                      </button>
                      <button className="q-btn-icon" onClick={() => handleDelete(wf.id)} disabled={isPending} style={{ color: 'var(--q-color-danger)', marginLeft: '8px' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

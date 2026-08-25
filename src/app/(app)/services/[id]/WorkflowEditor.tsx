'use client';

import React from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import { Combo } from '@/components/Pick';

export type WorkflowInput = {
  name: string;
  tasks: { name: string; roleName?: string | null; description?: string }[];
};

export function WorkflowEditor({
  workflow,
  availableWorkflows,
  roleOptions,
  onChange,
}: {
  workflow?: WorkflowInput | null;
  availableWorkflows?: any[];
  roleOptions?: string[];
  onChange: (workflow: WorkflowInput | null) => void;
}) {
  const tasks = workflow?.tasks || [];

  const updateTask = (index: number, updates: Partial<typeof tasks[0]>) => {
    if (!workflow) return;
    const newTasks = [...workflow.tasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    onChange({ ...workflow, tasks: newTasks });
  };

  const removeTask = (index: number) => {
    if (!workflow) return;
    const newTasks = [...workflow.tasks];
    newTasks.splice(index, 1);
    onChange({ ...workflow, tasks: newTasks });
  };

  const addTask = () => {
    if (!workflow) {
      onChange({ name: 'Standard Workflow', tasks: [{ name: '' }] });
      return;
    }
    onChange({ ...workflow, tasks: [...workflow.tasks, { name: '' }] });
  };



  return (
    <div className="q-card q-section">
      <div className="q-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="q-section-title">Process & Tasks</h2>
      </div>
      <p className="q-text-meta" style={{ marginBottom: '16px' }}>
        Define the workflow and tasks required to deliver this service. These will be copied to any package that bundles it.
      </p>

      {workflow && (
        <div style={{ marginBottom: '16px' }}>
          <label className="q-label">Workflow Name</label>
          <Combo
            text={workflow.name}
            setText={(val) => onChange({ ...workflow, name: val })}
            options={availableWorkflows?.map(w => w.name) || []}
            placeholder="e.g. Standard Wedding Workflow"
            onCommit={(val) => {
              const tpl = availableWorkflows?.find(w => w.name.toLowerCase() === val.toLowerCase());
              if (tpl) {
                onChange({
                  name: tpl.name,
                  tasks: (tpl.tasks || []).map((t: any) => ({
                    name: t.name,
                    roleName: t.role_name || t.roleName,
                    description: t.description
                  }))
                });
              } else {
                onChange({ ...workflow, name: val });
              }
            }}
          />
        </div>
      )}

      {tasks.length > 0 && (
        <div className="q-stack" style={{ gap: '12px', marginBottom: '16px' }}>
          {tasks.map((task, i) => (
            <div key={i} className="q-panel q-row" style={{ gap: '12px', alignItems: 'flex-start' }}>
              <GripVertical size={16} style={{ color: 'var(--q-color-ink-400)', marginTop: '10px', cursor: 'grab' }} />
              <div style={{ flex: 1 }}>
                <input
                  className="q-input"
                  placeholder="Task Name (e.g. Retouching, Color Grading)"
                  value={task.name}
                  onChange={(e) => updateTask(i, { name: e.target.value })}
                />
                <input
                  className="q-input"
                  placeholder="Description (Optional)"
                  value={task.description || ''}
                  onChange={(e) => updateTask(i, { description: e.target.value })}
                  style={{ marginTop: '8px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Combo
                  text={task.roleName || ''}
                  setText={(val) => updateTask(i, { roleName: val })}
                  onCommit={(val) => updateTask(i, { roleName: val })}
                  options={roleOptions || []}
                  placeholder="Role (e.g. Editor, Photographer)"
                />
              </div>
              <button
                type="button"
                className="q-btn-icon"
                onClick={() => removeTask(i)}
                style={{ color: 'var(--q-color-danger)', marginTop: '4px' }}
                title="Remove task"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="q-btn q-btn-secondary" onClick={addTask} style={{ fontSize: '0.9rem' }}>
        <Plus size={16} /> {workflow ? 'Add Task' : 'Add Workflow'}
      </button>

      {workflow && (
        <button type="button" className="q-btn-icon" onClick={() => onChange(null)} style={{ marginLeft: '12px', color: 'var(--q-color-danger)', fontSize: '0.9rem', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Remove Workflow entirely
        </button>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';


export function TaskProgression({
  bookingId,
  lineId,
  tasks,
  employees,
  pkg
}: {
  bookingId: string;
  lineId: string;
  tasks: any[];
  employees: any[];
  pkg?: any;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [assigningTask, setAssigningTask] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState('');

  if (!tasks || tasks.length === 0) return null;

  async function handleAssign(taskId: string) {
    if (!selectedEmp) return;
    setIsUpdating(true);
    try {
      const { assignToTask } = await import('@/modules/production/interface');
      await assignToTask({
        bookingId,
        taskId,
        employeeId: selectedEmp,
      });
      setAssigningTask(null);
      setSelectedEmp('');
    } catch (err) {
      alert('Failed to assign staff');
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleUnassign(taskId: string) {
    setIsUpdating(true);
    try {
      const { unassignTask } = await import('@/modules/production/interface');
      await unassignTask({ bookingId, taskId });
    } catch (err) {
      alert('Failed to remove assignment');
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleToggleTaskComplete(taskId: string) {
    setIsUpdating(true);
    try {
      const { advanceBookingLineTask } = await import('@/modules/production/interface');
      await advanceBookingLineTask({ bookingId, lineId, taskId });
    } catch (err) {
      alert('Failed to update task');
    } finally {
      setIsUpdating(false);
    }
  }

  // Group tasks by package_service_id
  const tasksByService = tasks.reduce((acc, t) => {
    const sid = t.package_service_id || 'unlinked';
    if (!acc[sid]) acc[sid] = [];
    acc[sid].push(t);
    return acc;
  }, {} as Record<string, any[]>);

  // Map package_service_id to service name
  const serviceNames = (pkg?.package_services || []).reduce((acc: any, ps: any) => {
    acc[ps.id] = ps.service?.name || 'Unknown Service';
    return acc;
  }, {});
  serviceNames['unlinked'] = 'General Tasks';

  return (
    <div className="q-stack" style={{ marginTop: '16px', gap: '16px' }}>
      {Object.keys(tasksByService).map(sid => {
        const groupTasks = tasksByService[sid].sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
        if (groupTasks.length === 0) return null;

        // The active task is the first incomplete task in this service's sequence
        const activeTaskIndex = groupTasks.findIndex((t: any) => !t.completed_at);
        const activeTaskId = activeTaskIndex >= 0 ? groupTasks[activeTaskIndex].id : null;

        return (
          <div key={sid} className="q-stack q-stack-sm">
            <h4 className="q-strong" style={{ fontSize: '0.85rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {serviceNames[sid] || 'Tasks'}
            </h4>
            <div className="q-stack" style={{ gap: '6px' }}>
              {groupTasks.map((t: any, idx: number) => {
                const eligibleEmps = t.role 
                  ? employees.filter(e => e.employee_roles?.some((er: any) => er.role?.id === t.role.id))
                  : employees;

                const isDone = !!t.completed_at;
                const isCurrent = t.id === activeTaskId;

                return (
                  <div key={t.id} className="q-row q-row-between" style={{ alignItems: 'center', padding: '6px 8px', background: isCurrent ? 'var(--q-color-ultramarine-100)' : 'var(--q-color-neutral-100)', borderRadius: '6px' }}>
                    <div className="q-row" style={{ alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleTaskComplete(t.id)}
                        disabled={isUpdating}
                        className="q-btn q-btn-xs"
                        style={{
                          padding: '2px 6px',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          background: isCurrent ? 'var(--q-color-ultramarine-500)' : isDone ? 'var(--q-color-neutral-800)' : 'transparent',
                          color: isCurrent || isDone ? 'white' : 'var(--q-color-ink-500)',
                          border: isCurrent || isDone ? 'none' : '1px solid var(--q-color-neutral-400)',
                        }}
                        title={isDone ? "Mark incomplete" : "Mark complete"}
                      >
                        {isDone ? '✓' : idx + 1}
                      </button>
                      <span style={{ fontSize: '0.9rem', opacity: isDone ? 0.6 : 1, fontWeight: isCurrent ? 500 : 400 }}>
                        {t.name}
                      </span>
                      {t.role && (
                        <span className="q-badge q-badge-neutral" style={{ fontSize: '0.75rem', padding: '1px 4px' }}>
                          {t.role.name}
                        </span>
                      )}
                    </div>

                    <div>
                      {t.assignee ? (
                        <div className="q-row" style={{ alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{t.assignee.display_name}</span>
                          <button 
                            type="button" 
                            onClick={() => handleUnassign(t.id)} 
                            disabled={isUpdating}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0 }}
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        assigningTask === t.id ? (
                          <div className="q-row" style={{ alignItems: 'center', gap: '4px' }}>
                            <select 
                              className="q-input" 
                              value={selectedEmp} 
                              onChange={e => setSelectedEmp(e.target.value)}
                              disabled={isUpdating}
                              style={{ padding: '2px 4px', fontSize: '0.8rem', height: 'auto', minHeight: '24px' }}
                            >
                              <option value="">Select staff...</option>
                              {eligibleEmps.map((emp: any) => (
                                <option key={emp.contact?.id} value={emp.contact?.id}>{emp.contact?.display_name || 'Unnamed'}</option>
                              ))}
                            </select>
                            <button type="button" className="q-btn q-btn-primary q-btn-xs" onClick={() => handleAssign(t.id)} disabled={!selectedEmp || isUpdating}>
                              Save
                            </button>
                            <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => setAssigningTask(null)} disabled={isUpdating}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button 
                            type="button" 
                            className="q-plain-link" 
                            style={{ fontSize: '0.8rem', opacity: 0.8 }} 
                            onClick={() => { setAssigningTask(t.id); setSelectedEmp(''); }}
                          >
                            + Assign
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

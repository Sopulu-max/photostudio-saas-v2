'use client';

import { useState } from 'react';
import { assignToBookingLine, removeAssignment } from '@/modules/production/interface';


export function TaskProgression({
  bookingId,
  lineId,
  currentTaskId,
  tasks,
  employees,
}: {
  bookingId: string;
  lineId: string;
  currentTaskId: string | null;
  tasks: any[];
  employees: any[];
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [assigningTask, setAssigningTask] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState('');

  // Not all lines have tasks configured
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

  async function handleSetCurrentTask(taskId: string | null) {
    setIsUpdating(true);
    try {
      const { advanceBookingLineTask } = await import('@/modules/production/interface');
      await advanceBookingLineTask({ bookingId, lineId, taskId });
    } catch (err) {
      alert('Failed to advance task');
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
      <h4 className="q-strong" style={{ fontSize: '0.85rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasks</h4>
      <div className="q-stack" style={{ gap: '6px' }}>
        {tasks.sort((a, b) => (a.position || 0) - (b.position || 0)).map((t, idx) => {
          // Filter employees who have this task's required role, or all if no role
          const eligibleEmps = t.role 
            ? employees.filter(e => e.employee_roles?.some((er: any) => er.role?.id === t.role.id))
            : employees;

          const currentIndex = currentTaskId ? tasks.findIndex(x => x.id === currentTaskId) : -1;
          const isDone = currentIndex !== -1 && idx < currentIndex;
          const isCurrent = t.id === currentTaskId;

          return (
            <div key={t.id} className="q-row q-row-between" style={{ alignItems: 'center', padding: '6px 8px', background: isCurrent ? 'var(--q-color-ultramarine-100)' : 'var(--q-color-neutral-100)', borderRadius: '6px' }}>
              <div className="q-row" style={{ alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSetCurrentTask(t.id)}
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
                  title="Set as current task"
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
                        {eligibleEmps.map(emp => (
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
}

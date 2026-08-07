'use client';

import React, { useState, useTransition } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { updateTaskStatus } from '@/modules/production/interface';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TaskAssignControl } from '@/components/TaskAssignControl';

// Matches the type in TasksClient.tsx
type Task = {
  taskId: string;
  stageName: string;
  status: string;
  dueDate: string | null;
  lineTitle: string | null;
  bookingId: string;
  bookingTitle: string;
  suggestedRoleId?: string | null;
  suggestedRoleName?: string | null;
  isFrontStage?: boolean | null;
  assignees: { assignmentId: string; employeeId: string; name: string; role: string | null }[];
};

type Candidate = { employeeId: string; name: string; roles: { id: string; name: string }[] };

const COLUMNS = [
  { id: 'created', label: 'To Do' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'completed', label: 'Done' },
];

const BADGE: Record<string, string> = {
  completed: 'q-badge-success',
  in_progress: 'q-badge-warning',
  blocked: 'q-badge-danger',
};

// ----------------------------------------------------------------------
// Kanban Card
// ----------------------------------------------------------------------
function KanbanCard({
  task,
  candidates,
  isOverlay = false,
}: {
  task: Task;
  candidates: Candidate[];
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.taskId,
    data: { type: 'Task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    backgroundColor: 'var(--q-color-ground)',
    border: '1px solid var(--q-color-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: isOverlay ? 'var(--q-shadow-md)' : 'var(--q-shadow-sm)',
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className="q-row q-row-between" style={{ alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '3px' }}>
            {task.stageName}
            {task.isFrontStage === false && <span className="q-meta-sm"> · back</span>}
          </div>
          <div className="q-meta-sm">
            <Link href={`/bookings/${task.bookingId}`} className="q-plain-link" style={{ textDecoration: 'underline' }} onPointerDown={(e) => e.stopPropagation()}>
              {task.bookingTitle}
            </Link>
          </div>
        </div>
        <span className={`q-badge ${BADGE[task.status] || 'q-badge-neutral'}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
          {task.status.replace('_', ' ')}
        </span>
      </div>

      <div onPointerDown={(e) => e.stopPropagation()}>
        <TaskAssignControl
          taskId={task.taskId}
          bookingId={task.bookingId}
          assignees={task.assignees}
          candidates={candidates}
          dueDate={task.dueDate}
          suggestedRoleId={task.suggestedRoleId}
          suggestedRoleName={task.suggestedRoleName}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Kanban Column
// ----------------------------------------------------------------------
function KanbanColumn({
  column,
  tasks,
  candidates,
}: {
  column: { id: string; label: string };
  tasks: Task[];
  candidates: Candidate[];
}) {
  const { setNodeRef } = useSortable({
    id: column.id,
    data: { type: 'Column', column },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: '320px',
        maxWidth: '320px',
        backgroundColor: 'var(--q-color-ink-50)',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <div className="q-row q-row-between" style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--q-color-ink-900)' }}>
          {column.label}
        </h3>
        <span className="q-badge q-badge-neutral" style={{ fontSize: '0.75rem' }}>{tasks.length}</span>
      </div>

      <SortableContext items={tasks.map((t) => t.taskId)} strategy={verticalListSortingStrategy}>
        <div style={{ minHeight: '150px' }}>
          {tasks.map((task) => (
            <KanbanCard key={task.taskId} task={task} candidates={candidates} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ----------------------------------------------------------------------
// Kanban Board
// ----------------------------------------------------------------------
export function KanbanBoard({
  tasks,
  candidates,
  orgId,
  actorId,
}: {
  tasks: Task[];
  candidates: Candidate[];
  orgId: string;
  actorId: string;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>(tasks);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Sync optimistic tasks with server tasks when they arrive
  React.useEffect(() => {
    setOptimisticTasks(tasks);
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'Task') {
      setActiveTask(active.data.current.task);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = optimisticTasks.find((t) => t.taskId === activeId);
    if (!activeTask) return;

    const isOverColumn = COLUMNS.some((c) => c.id === overId);
    let newStatus = activeTask.status;

    if (isOverColumn) {
      newStatus = overId;
    } else {
      const overTask = optimisticTasks.find((t) => t.taskId === overId);
      if (overTask) {
        newStatus = overTask.status;
      }
    }

    if (newStatus === activeTask.status) return;

    // Server is the ultimate guard, but we'll cheerfully update optimistically
    const prevTasks = [...optimisticTasks];
    setOptimisticTasks(optimisticTasks.map((t) => (t.taskId === activeId ? { ...t, status: newStatus } : t)));

    startTransition(async () => {
      try {
        await updateTaskStatus(activeId, orgId, newStatus as any, actorId);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not update task status.');
        setOptimisticTasks(prevTasks); // Revert on failure
      }
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '24px' }}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            candidates={candidates}
            tasks={optimisticTasks.filter((t) => t.status === col.id)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? <KanbanCard task={activeTask} candidates={candidates} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

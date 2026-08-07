import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getEmployee, listRoles } from '@/modules/team/interface';
import { listTasksForEmployee, listBookingAssignmentsForEmployee } from '@/modules/production/interface';
import { AvatarUpload } from '@/components/AvatarUpload';
import { stageBadgeClass } from '@/components/stageBadge';
import { EmployeeEditor } from './EmployeeEditor';
import { EmployeeRoles } from './EmployeeRoles';

export const dynamic = 'force-dynamic';

const TASK_BADGE: Record<string, string> = {
  in_progress: 'q-badge-accent',
  blocked:     'q-badge-danger',
  assigned:    'q-badge-warning',
  created:     'q-badge-neutral',
  completed:   'q-badge-success',
};

const TASK_LABEL: Record<string, string> = {
  created: 'Created', assigned: 'Assigned', in_progress: 'In progress',
  blocked: 'Blocked', completed: 'Done',
};

export default async function EmployeeDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const employee: any = await getEmployee(params.id);
  if (!employee) notFound();

  const allRoles = await listRoles();
  const assignedRoles = (employee.employee_roles || [])
    .map((er: any) => er.role)
    .filter((r: any) => r?.id);
  const assignedIds = new Set(assignedRoles.map((r: any) => r.id));
  const availableRoles = (allRoles as any[]).filter((r) => !assignedIds.has(r.id));

  const [tasks, bookingAssignments] = await Promise.all([
    listTasksForEmployee(params.id),
    listBookingAssignmentsForEmployee(params.id),
  ]);

  const openTasks = tasks.filter((t) => t.status !== 'completed');
  const doneTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="q-page-narrow">
      <Link href="/team" className="q-back">&larr; Back to Team</Link>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{employee.contact?.display_name}</h1>
          <p className="q-page-subtitle">{employee.title || employee.contact?.email || 'No title set'}</p>
        </div>
        <span className={`q-badge ${employee.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
          {employee.status}
        </span>
      </header>

      <div className="q-stack q-stack-lg">

        <div className="q-card q-section">
          <AvatarUpload contactId={employee.contact.id} name={employee.contact?.display_name || ''} url={employee.contact?.avatar_url ?? null} />
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Details</h2>
          <EmployeeEditor
            employeeId={employee.id}
            name={employee.contact?.display_name || ''}
            email={employee.contact?.email}
            phone={employee.contact?.phone}
            title={employee.title}
            skills={employee.skills || []}
            status={employee.status}
          />
        </div>

        <div className="q-card q-section">
          <h2 className="q-section-title">Roles</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What this person can be assigned to on a booking.
          </p>
          <EmployeeRoles employeeId={employee.id} assigned={assignedRoles} available={availableRoles} />
        </div>

        {/* Current task load */}
        <div className="q-card q-section">
          <h2 className="q-section-title">
            Tasks
            {openTasks.length > 0 && (
              <span className="q-badge q-badge-warning" style={{ marginLeft: '10px' }}>{openTasks.length} open</span>
            )}
          </h2>
          {tasks.length === 0 ? (
            <p className="q-empty">Nothing assigned yet.</p>
          ) : (
            <>
              {openTasks.length > 0 && (
                <div className="q-stack q-stack-sm" style={{ marginBottom: doneTasks.length > 0 ? '16px' : 0 }}>
                  {openTasks.map((t) => (
                    <Link key={t.taskId} href={`/bookings/${t.bookingId}`} className="q-tile q-row q-row-between q-plain-link">
                      <div>
                        <strong className="q-strong">{t.stageName}</strong>
                        <div className="q-meta">
                          {t.bookingTitle}
                          {t.lineTitle && t.lineTitle !== t.bookingTitle ? ` · ${t.lineTitle}` : ''}
                        </div>
                      </div>
                      <div className="q-row">
                        {t.dueDate && (
                          <span className="q-meta-sm">
                            due {new Date(t.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        <span className={`q-badge ${TASK_BADGE[t.status] ?? 'q-badge-neutral'}`}>
                          {TASK_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {doneTasks.length > 0 && (
                <details>
                  <summary className="q-meta" style={{ cursor: 'pointer' }}>
                    {doneTasks.length} completed task{doneTasks.length === 1 ? '' : 's'}
                  </summary>
                  <div className="q-stack q-stack-sm" style={{ marginTop: '8px', opacity: 0.65 }}>
                    {doneTasks.map((t) => (
                      <Link key={t.taskId} href={`/bookings/${t.bookingId}`} className="q-tile q-row q-row-between q-plain-link">
                        <div>
                          <strong className="q-strong">{t.stageName}</strong>
                          <div className="q-meta">{t.bookingTitle}</div>
                        </div>
                        <span className="q-badge q-badge-success">Done</span>
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        {/* Bookings they're on directly (shoot-level, before tasks exist) */}
        {bookingAssignments.length > 0 && (
          <div className="q-card q-section">
            <h2 className="q-section-title">
              On {bookingAssignments.length} booking{bookingAssignments.length === 1 ? '' : 's'}
            </h2>
            <div className="q-stack q-stack-sm">
              {bookingAssignments.map((a) => (
                <Link key={a.assignmentId} href={`/bookings/${a.bookingId}`} className="q-tile q-row q-row-between q-plain-link">
                  <div>
                    <strong className="q-strong">{a.bookingTitle}</strong>
                    <div className="q-meta">
                      {a.role && <span>{a.role} · </span>}
                      {a.scheduledFor
                        ? new Date(a.scheduledFor).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No date set'}
                    </div>
                  </div>
                  {a.stage && (
                    <span className={`q-badge ${stageBadgeClass(a.stage)}`}>{a.stage.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

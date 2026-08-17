import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getEmployee, listAttendanceForEmployee } from '@/modules/team/interface';
import { getStudio } from '@/kernel/organizations';
import { listTasksForEmployee, listBookingAssignmentsForEmployee } from '@/modules/production/interface';
import { ContactAvatar } from '@/components/ContactAvatar';
import { stageBadgeClass } from '@/components/stageBadge';

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

export default async function EmployeeProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const employee: any = await getEmployee(params.id);
  if (!employee) notFound();

  const [tasks, bookingAssignments, attendance, studio] = await Promise.all([
    listTasksForEmployee(params.id),
    listBookingAssignmentsForEmployee(params.id),
    listAttendanceForEmployee(params.id, 14),
    getStudio(),
  ]);
  const timezone = studio?.timezone || 'UTC';
  const asTime = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso));
  const asDay = (day: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  const asSpan = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`);

  const openTasks = tasks.filter((t) => t.status !== 'completed');
  const doneTasks = tasks.filter((t) => t.status === 'completed');

  const contact = employee.contact || {};
  const roles: { id: string; name: string }[] = (employee.employee_roles || [])
    .map((er: any) => er.role)
    .filter((r: any) => r?.id);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="q-card q-section">
      <h2 className="q-section-title">{title}</h2>
      {children}
    </div>
  );

  return (
    <div className="q-page-narrow">
      <Link href="/team" className="q-back">&larr; Back to Team</Link>

      <header className="q-page-header">
        <div className="q-row" style={{ gap: '16px', alignItems: 'center' }}>
          <ContactAvatar name={contact.display_name || ''} url={contact.avatar_url} size="lg" />
          <div>
            <h1 className="q-page-title" style={{ marginBottom: '2px' }}>{contact.display_name}</h1>
            {employee.title && (
              <p className="q-page-subtitle" style={{ margin: 0 }}>{employee.title}</p>
            )}
          </div>
        </div>
        <div className="q-row">
          <span className={`q-badge ${employee.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
            {employee.status}
          </span>
          <Link href={`/team/${params.id}/edit`} className="q-btn q-btn-secondary">
            Edit profile
          </Link>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        {/* Identity — read-only summary */}
        <Section title="Profile">
          <div className="q-stack q-stack-sm">
            {contact.email && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Email</span>
                <span>{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Phone</span>
                <span>{contact.phone}</span>
              </div>
            )}
            {employee.title && (
              <div className="q-tile q-row q-row-between">
                <span className="q-meta">Title</span>
                <span>{employee.title}</span>
              </div>
            )}
            {!contact.email && !contact.phone && !employee.title && (
              <p className="q-empty">No contact details yet. <Link href={`/team/${params.id}/edit`} className="q-accent">Add them →</Link></p>
            )}
          </div>
        </Section>

        {/*
          * One list, not two. Roles were what blueprints route work to; skills
          * were a parallel free-text list that staffing never consulted, so a
          * studio could record that someone flies a drone and never be offered
          * them for a drone shoot. Same vocabulary now.
          */}
        {roles.length > 0 && (
          <Section title="What they can do">
            <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
              {roles.map((r) => (
                <span key={r.id} className="q-badge q-badge-neutral">{r.name}</span>
              ))}
            </div>
          </Section>
        )}

        {/* Task load — current work */}
        {/*
          * When they were actually here. Every other section on this page is
          * planned work — this is the only one that says what happened.
          */}
        <Section title="Recent days">
          {attendance.length === 0 ? (
            <p className="q-empty">
              No days recorded yet. They check in from the{' '}
              <Link className="q-accent" href="/attendance">attendance board</Link>.
            </p>
          ) : (
            <div className="q-stack q-stack-sm">
              {attendance.map((a) => (
                <div key={a.id} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <strong className="q-strong">{asDay(a.workDate)}</strong>
                  <span className="q-row" style={{ gap: '10px', alignItems: 'center' }}>
                    <span className="q-meta-sm">
                      {asTime(a.checkedInAt)}
                      {a.checkedOutAt ? ` – ${asTime(a.checkedOutAt)}` : ''}
                    </span>
                    {a.minutes != null
                      ? <span className="q-badge q-badge-neutral">{asSpan(a.minutes)}</span>
                      : <span className="q-badge q-badge-success">still in</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Tasks${openTasks.length > 0 ? ` · ${openTasks.length} open` : ''}`}>
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
        </Section>

        {/* Booking-level assignments (shoot roster, before tasks exist) */}
        {bookingAssignments.length > 0 && (
          <Section title={`On ${bookingAssignments.length} booking${bookingAssignments.length === 1 ? '' : 's'}`}>
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
          </Section>
        )}

      </div>
    </div>
  );
}

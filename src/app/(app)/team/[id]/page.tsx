import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getEmployee, listAttendanceForEmployee } from '@/modules/team/interface';
import { getStudio } from '@/kernel/organizations';
import { ContactAvatar } from '@/components/ContactAvatar';
import { WorkingDaysForm } from './WorkingDaysForm';
import { AttendanceHistory } from './AttendanceHistory';
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

  const [attendance, studio] = await Promise.all([
    
    
    listAttendanceForEmployee(params.id, 14),
    getStudio(),
  ]);
  const timezone = studio?.timezone || 'UTC';

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
            {!contact.email && !contact.phone && (
              <p className="q-empty">No contact details yet. <Link href={`/team/${params.id}/edit`} className="q-accent">Add them →</Link></p>
            )}
          </div>
        </Section>

        {/*
          * One vocabulary, not two. Roles are what blueprints route work to;
          * skills were a parallel free-text list that staffing never consulted,
          * so an employee's drone experience could be recorded and never
          * surfaced when a drone shoot needed staffing.
          */}
        {roles.length > 0 && (
          <Section title="Roles">
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
        {/* The schedule sits above the record: expected and actual only mean
            something as a pair. */}
        <Section title="Working days">
          <WorkingDaysForm
            employeeId={employee.id}
            initial={(employee.working_days || []) as number[]}
            name={contact.display_name || 'they'}
          />
        </Section>

        <Section title="Attendance">
          {attendance.length === 0 ? (
            <p className="q-empty">
              No attendance recorded. Check-in is done from the{' '}
              <Link className="q-accent" href="/attendance">attendance register</Link>.
            </p>
          ) : (
            // Correctable here, not only on the register. Mistakes are usually
            // noticed days later, and the board can only reach today.
            <AttendanceHistory days={attendance} timezone={timezone} />
          )}
        </Section>

      </div>
    </div>
  );
}
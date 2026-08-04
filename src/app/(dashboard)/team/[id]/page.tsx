import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getEmployee, listRoles } from '@/modules/team/interface';
import { AvatarUpload } from '@/components/AvatarUpload';
import { EmployeeEditor } from './EmployeeEditor';
import { EmployeeRoles } from './EmployeeRoles';

export const dynamic = 'force-dynamic';

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

      </div>
    </div>
  );
}

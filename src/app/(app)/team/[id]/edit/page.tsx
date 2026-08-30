import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getEmployee, listRoles } from '@/modules/team/interface';
import { AvatarUpload } from '@/components/AvatarUpload';
import { EmployeeEditor } from '../EmployeeEditor';
import { EmployeeRoles } from '../EmployeeRoles';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage(props: { params: Promise<{ id: string }> }) {
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
      <Link href={`/team/${params.id}`} className="q-back">&larr; Back to profile</Link>

      <header className="q-page-header">
        <div>
          <span className="q-eyebrow">Editing</span>
          <h1 className="q-page-title">{employee.contact?.display_name || 'This person'}</h1>
        </div>
      </header>

      <div className="q-stack q-stack-lg">

        {/* Photo */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Photo</h2>
          <AvatarUpload
            contactId={employee.contact.id}
            name={employee.contact?.display_name || ''}
            url={employee.contact?.avatar_url ?? null}
          />
        </div>

        {/* Personal details + skills */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Details</h2>
          <EmployeeEditor
            employeeId={employee.id}
            name={employee.contact?.display_name || ''}
            email={employee.contact?.email ?? null}
            phone={employee.contact?.phone ?? null}
            status={employee.status}
          />
        </div>

        {/* Roles — what productions can route to this person */}
        <div className="q-card q-section">
          <h2 className="q-section-title">Roles</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            What this person can be assigned to on a booking. Workflows route tasks to roles, and roles route to people.
          </p>
          <EmployeeRoles employeeId={employee.id} assigned={assignedRoles} available={availableRoles} />
        </div>

      </div>
    </div>
  );
}

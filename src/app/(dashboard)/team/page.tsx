import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listEmployees, listRoles } from '@/modules/team/interface';
import { AddEmployeeForm, NewRoleForm, AssignRoleControl } from './TeamForms';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const [employees, roles] = await Promise.all([listEmployees(), listRoles()]);

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Team</h1>
          <p className="q-page-subtitle">Who does the work — and the roles your studio defines for it.</p>
        </div>
        <AddEmployeeForm />
      </header>

      <div className="q-stack q-stack-lg">

        <div className="q-card q-table-container">
          <table className="q-table">
            <thead>
              <tr>
                <th className="q-table-th">Employee</th>
                <th className="q-table-th">Contact</th>
                <th className="q-table-th">Title</th>
                <th className="q-table-th">Roles</th>
                <th className="q-table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="q-table-td q-center-text q-muted">
                    No employees yet.
                  </td>
                </tr>
              ) : (
                employees.map((e: any) => (
                  <tr key={e.id} className="q-table-tr">
                    <td className="q-table-td q-strong">{e.contact?.display_name}</td>
                    <td className="q-table-td q-meta">
                      {e.contact?.email || e.contact?.phone || '—'}
                    </td>
                    <td className="q-table-td q-muted">{e.title || '—'}</td>
                    <td className="q-table-td">
                      <div className="q-row">
                        {(e.employee_roles || []).map((er: any) => (
                          <span key={er.role?.id} className="q-badge q-badge-neutral">{er.role?.name}</span>
                        ))}
                        <AssignRoleControl
                          employeeId={e.id}
                          roles={roles.filter((r: any) => !(e.employee_roles || []).some((er: any) => er.role?.id === r.id))}
                        />
                      </div>
                    </td>
                    <td className="q-table-td">
                      <span className={`q-badge ${e.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{e.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="q-card">
          <h2 style={{ fontSize: '1.05rem', marginTop: 0, marginBottom: '6px', fontWeight: 600 }}>Roles</h2>
          <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
            Define the roles your productions need — assignments will match employees to these.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {roles.length === 0 ? (
              <span className="q-meta">No roles defined yet.</span>
            ) : (
              roles.map((r: any) => <span key={r.id} className="q-badge q-badge-neutral">{r.name}</span>)
            )}
          </div>
          <NewRoleForm />
        </div>

      </div>
    </div>
  );
}

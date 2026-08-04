/**
 * Team — public interface. The only door in.
 * Production will resolve "who can fill role X" through here, never by
 * touching employees/roles tables directly.
 */
export {
  addEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  setEmployeeStatus,
  createRole,
  listRoles,
  updateRole,
  deleteRole,
  assignRole,
  removeRoleAssignment,
} from './domain';

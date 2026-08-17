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
  findOrCreateRole,
  listRoles,
  updateRole,
  deleteRole,
  assignRole,
  removeRoleAssignment,
} from './domain';

// Attendance — the first thing this system knows about a person that isn't
// planned work. Lives in Team because it is a fact about people, and every
// other module asks for it through here.
export {
  getAttendanceToday,
  checkIn,
  checkOut,
  listAttendanceForEmployee,
  setStudioTimezone,
} from './attendance';
export type { AttendanceToday } from './attendance';

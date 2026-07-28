/**
 * Production — public interface. The only door in.
 * The doing: a booking line's work and its tasks, plus who is assigned to them.
 * Bookings starts work through here; Team supplies the people.
 */
export {
  createWorkflow,
  startWorkForBookingLine,
  createTask,
  updateTaskStatus,
  updateWorkflowStatus,
  assignTask,
  assignToBooking,
  removeFromBooking,
  listCrewForBooking,
  listAssignableEmployees,
} from './domain';

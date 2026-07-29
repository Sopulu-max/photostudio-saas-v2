/**
 * Production — public interface. The only door in.
 * The doing: a booking line's tasks and who is assigned to them. The line is
 * the production unit; there is no workflow container. Bookings starts work
 * through here; Team supplies the people.
 */
export {
  startWorkForBookingLine,
  updateTaskStatus,
  getWorkForLines,
  assignTask,
  assignToBooking,
  removeFromBooking,
  listCrewForBooking,
  listAssignableEmployees,
  listMyTasks,
  listTaskDeadlinesInRange,
} from './domain';

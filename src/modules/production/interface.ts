/**
 * Production — the doing. The booking LINE is the production unit, a TASK on
 * that line is a piece of work, and a person can be on the booking, on a task,
 * or both.
 *
 * WHY BOTH. Being on a job and doing a particular task are different facts.
 * A photographer is on Saturday's shoot before anyone has written down which
 * tasks they will do; an editor joins a week later for work nobody itemised.
 * Deriving the crew only from task assignees said a booking with no tasks has
 * no crew — and since no package in this studio defines any tasks yet, that
 * meant no booking could have anyone on it at all.
 *
 * So addToBookingTeam records the crew directly, and assigning a task NARROWS
 * that rather than competing with it. getBookingTeam reads both and treats
 * anyone doing a task as being on the booking whether or not they were added
 * first, so there is one answer to "who is on this" and the two sources cannot
 * tell different stories.
 *
 * (assignToBookingLine and removeAssignment used to live here, writing the same
 * table per LINE rather than per booking. They had no surface — imported by the
 * booking screen and never called — so nothing could reach them and the table
 * stayed empty. The need was real; the implementation was not.)
 */
export {
  assignToTask,
  unassignTask,
  advanceBookingLineTask,
  getBookingTeam,
  addToBookingTeam,
  removeFromBookingTeam,
  // The booking's own work, collated across every package on it.
  getBookingTasks,
  setTaskRole,
  addBookingTask,
  removeBookingTask,
} from './domain';

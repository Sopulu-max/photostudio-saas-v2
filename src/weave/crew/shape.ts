import type { OnIt } from './actions';

/**
 * Who is on the work, said as a statement.
 *
 * The absence leads, because a booking with nobody on it is the thing
 * somebody has to act on and a list of names is not. A studio of one is the
 * ordinary case and must not read as a fault.
 *
 * Names with what they do beside them, because "Chidi, Ada" says less than a
 * studio already knows and "Chidi — photographer" is the fact. Somebody with
 * no role written down is named plainly rather than padded with a word this
 * system invented for them.
 */
export function sayCrew(crew: OnIt[]): string {
  if (crew.length === 0) return 'Nobody on it';
  return crew
    .map((m) => (m.role ? `${m.name} — ${m.role}` : m.name))
    .join(', ');
}

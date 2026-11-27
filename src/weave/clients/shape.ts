/**
 * The people a studio serves.
 *
 * The mirror of `weave/team`. One table holds everybody a studio knows, and
 * what somebody IS here is derived from the edges pointing at them — the
 * `who_works_here` migration settled that: "you are a client because a booking
 * points at you, a guest because a participant row says so". Employment was
 * the one fact with no edge, so it alone was stored.
 *
 * So a client is A PERSON A BOOKING POINTS AT, and that is the whole
 * definition. It matters that it is not "everybody who is not staff": a
 * gallery visitor who types an email to look at pictures becomes a person row
 * too, and a client list full of a wedding's guests is not a client list.
 */

export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Work the studio agreed to. */
  bookings: number;
  /** Asked for and never answered — they are waiting on the studio. */
  waiting: number;
  /** The soonest booking ahead, and the latest behind. */
  next: string | null;
  last: string | null;
  /** Paid, in minor units. What was ordered and not paid for is not spend. */
  spent: number;
  currency: string;
  /** First known to the studio. */
  since: string;
};

/**
 * Where a client stands, as a statement.
 *
 * One fact, the one that is actually live: what is coming if anything is,
 * otherwise what last happened, otherwise that nothing has. A row that listed
 * all three would be a record rather than a reading.
 */
function on(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function sayClient(client: Client): string {
  if (client.waiting > 0) {
    return client.waiting === 1
      ? 'Waiting on an answer'
      : `${client.waiting} requests waiting on an answer`;
  }
  if (client.next) return `Next shoot ${on(client.next)}`;
  if (client.last) return `Last shot ${on(client.last)}`;
  if (client.bookings > 0) return 'No date set';
  return 'No bookings';
}

/**
 * The client list, said as the studio.
 *
 * Leads with anybody waiting on an answer, because that is the only thing on
 * this page somebody can act on. A studio with one client is the ordinary
 * beginning and must not read as a deficiency.
 */
export function sayClients(clients: Client[]): string {
  if (clients.length === 0) return 'No clients.';

  const all = `${clients.length} ${clients.length === 1 ? 'client' : 'clients'}`;
  const waiting = clients.filter((c) => c.waiting > 0).length;
  if (waiting > 0) return `${all}, ${waiting} waiting on an answer.`;

  const booked = clients.filter((c) => c.next !== null).length;
  if (booked > 0) return `${all}, ${booked} with a shoot ahead.`;
  return `${all}.`;
}

/**
 * Two people who may be one.
 *
 * Every public enquiry writes a NEW person, deliberately — matching on a typed
 * email would hand a stranger somebody else's history. The cost is duplicates,
 * and three places in this codebase promise a merge that does not exist yet.
 * Until it does, the list says so rather than letting a studio believe it has
 * three clients called Ada Okafor.
 */
export function duplicatesOf(clients: Client[]): Client[][] {
  const byEmail = new Map<string, Client[]>();
  for (const client of clients) {
    const key = client.email?.trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, [...(byEmail.get(key) ?? []), client]);
  }
  return [...byEmail.values()].filter((group) => group.length > 1);
}

/** Said only when there is something to say. Silence is the good case. */
export function sayDuplicates(groups: Client[][]): string | null {
  if (groups.length === 0) return null;
  const people = groups.reduce((n, group) => n + group.length, 0);
  return groups.length === 1
    ? `${people} records share one email address.`
    : `${people} records share ${groups.length} email addresses.`;
}

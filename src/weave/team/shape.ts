/**
 * The people who work at a studio.
 *
 * Employment is the one relationship in this system with no edge behind it.
 * A client is a client because a booking points at them; a guest is a guest
 * because a participant row says so. Nothing derives "works here", so it is
 * recorded — as two timestamps, not a flag, because people join and leave and
 * a studio has reason to know who shot a wedding two years ago.
 *
 * THIS LIST DECIDES WHO CAN BE PUT ON A BOOKING. `weave.people` holds a
 * studio's clients and its gallery visitors in the same table, and the crew
 * picker once offered all of them, so a studio could staff a shoot with its
 * own customer. `joined_at` is the whole of the difference.
 */

export type TeamMember = {
  id: string;
  name: string;
  /** What they do here, in the studio's own words. Null until somebody says. */
  role: string | null;
  email: string | null;
  phone: string | null;
  /** Where their picture sits in the bucket. A path, signed when looked at. */
  avatarPath: string | null;
  joinedAt: string;
  leftAt: string | null;
  /**
   * Bookings they are on that are not behind them: dated today or later, and
   * undated ones, because a booking nobody has put a day to is still work
   * somebody is carrying.
   */
  booked: number;
};

export function worksHere(member: TeamMember): boolean {
  return member.leftAt === null;
}

/**
 * Said as the studio, not as a row count.
 *
 * A studio of one is the common case and should not read as a deficiency.
 */
export function sayTeam(members: TeamMember[]): string {
  const here = members.filter(worksHere);
  const gone = members.length - here.length;

  if (here.length === 0) return 'No team members.';
  const current = `${here.length} ${here.length === 1 ? 'member' : 'members'}`;
  if (gone === 0) return `${current}.`;
  return `${current}, ${gone} former.`;
}

/**
 * What somebody is carrying, said on their line.
 *
 * The absence is stated. A team list that cannot say who is busy is an
 * address book, and a blank where a count belongs reads as a broken row.
 */
export function sayLoad(member: TeamMember): string {
  if (member.booked === 0) return 'No bookings';
  return `On ${member.booked} ${member.booked === 1 ? 'booking' : 'bookings'}`;
}

/**
 * What they have already done, said only when there is some.
 *
 * Capped nowhere here, but the page shows the recent ones: a list of every
 * shoot somebody has ever been on stops being a reading and becomes an
 * archive, and nobody scrolls an archive.
 */
export function sayDone(n: number): string | null {
  if (n === 0) return null;
  return `${n} earlier ${n === 1 ? 'booking' : 'bookings'}`;
}

/**
 * What stands in the way of letting somebody go.
 *
 * Not a block — a studio knows its own business, and somebody can leave with
 * shoots still on the books. But nobody should discover it afterwards.
 */
export function sayLeaving(member: TeamMember): string | null {
  if (member.booked === 0) return null;
  const n = member.booked;
  return `${member.name} is on ${n} unfinished ${n === 1 ? 'booking' : 'bookings'}.`;
}

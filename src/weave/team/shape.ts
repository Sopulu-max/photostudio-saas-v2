/**
 * The people who work at a studio.
 *
 * Employment is the one relationship in this system with no edge behind it.
 * A client is a client because a job points at them; a guest is a guest
 * because a participant row says so. Nothing derives "works here", so it is
 * recorded — as two timestamps, not a flag, because people join and leave and
 * a studio has reason to know who shot a wedding two years ago.
 */

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  leftAt: string | null;
  /** They can sign in. Not everyone who works here needs to. */
  hasAccount: boolean;
  /** Shoots ahead of today they are already on. */
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
 * What stands in the way of letting somebody go.
 *
 * Not a block — a studio knows its own business, and somebody can leave with
 * shoots still on the books. But nobody should discover it afterwards.
 */
export function sayLeaving(member: TeamMember): string | null {
  if (member.booked === 0) return null;
  return `${member.name} is assigned to ${member.booked} upcoming ${member.booked === 1 ? 'booking' : 'bookings'}.`;
}

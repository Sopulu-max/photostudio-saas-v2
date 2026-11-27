import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { facesFor, team } from '@/weave/team/actions';
import { sayTeam } from '@/weave/team/shape';
import { Team } from './Team';

export const dynamic = 'force-dynamic';

/**
 * The team.
 *
 * `weave.people` holds everybody a studio knows; this is the half it employs.
 * Crew on a shoot is drawn from here and nowhere else, which is what stops a
 * studio putting its own client on a booking.
 */
export default async function TeamPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const members = await team();

  /*
   * One round trip for every face on the page rather than one per person:
   * the bucket is private, so each path has to be signed, and signing them
   * in a loop is how a list of twelve people becomes twelve waits.
   */
  const faces = await facesFor(members.map((m) => m.avatarPath));

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Team</h1>
          <p className="q-page-subtitle">{sayTeam(members)}</p>
        </div>
      </header>

      <Team members={members} faces={Object.fromEntries(faces)} />
    </div>
  );
}

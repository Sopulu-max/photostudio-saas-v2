'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addToTeam } from '@/weave/team/actions';
import { sayLoad, worksHere, type TeamMember } from '@/weave/team/shape';
import { Reveal } from '@/components/Reveal';

/**
 * The people who work here.
 *
 * Crew comes from this list and nowhere else, so what it holds decides who
 * can be put on a booking. Somebody who has left stays, quietly, because the
 * record of who photographed a wedding is worth more than a tidy list.
 *
 * A LIST AND A DOOR. Changing somebody, and letting them go, happen on their
 * own page. This had an edit form unfolding inside the row, which made two
 * places to change one fact and put a leaving button on a line that is really
 * just a name. A row says who, what they do and what they are carrying, and
 * opens.
 *
 * NO ACCOUNT STATE. Every line said "Has account" or "No account" for a
 * while, which told a studio nothing it could act on: founding is the only
 * thing that has ever written `auth_user_id`, so the answer was the same for
 * everybody and there was no door beside it. It belongs here the day there is
 * an invite to press, as part of that control.
 */
export function Team({ members, faces }: {
  members: TeamMember[];
  /** Signed URLs by storage path, minted once by the page. */
  faces: Record<string, string>;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const here = members.filter(worksHere);
  const gone = members.filter((m) => !worksHere(m));

  return (
    <div className="q-stack q-stack-lg">
      <section className="q-stack q-stack-sm">
        {here.length === 0 ? (
          <p className="q-empty">No team members. Crew is assigned from this list.</p>
        ) : (
          <div className="q-sheet">
            {here.map((member) => (
              <Link className="q-mate" key={member.id} href={`/team/${member.id}`}>
                <span className="q-face">
                  {member.avatarPath && faces[member.avatarPath]
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={faces[member.avatarPath]} alt="" />
                    : <span className="q-face-bare">{member.name.slice(0, 1)}</span>}
                </span>

                <span className="q-mate-who">
                  {/* The studio's own spelling, of the name and the role. */}
                  <strong className="q-mate-name">{member.name}</strong>
                  <span className="q-meta">{member.role ?? 'No role given'}</span>
                  <span className="q-meta-sm">
                    {[member.email, member.phone].filter(Boolean).join(' · ')
                      || 'No contact details'}
                  </span>
                </span>

                {/* What they are carrying. A list that cannot say is a diary. */}
                <span className="q-mate-load">{sayLoad(member)}</span>
              </Link>
            ))}
          </div>
        )}

        <Reveal says="Add team member">
          {(done) => (
            <form
              className="q-stack q-stack-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const name = String(form.get('name') ?? '').trim();
                if (!name) { setProblem('Enter a name.'); return; }
                run(async () => {
                  await addToTeam({
                    name,
                    role: String(form.get('role') ?? ''),
                    email: String(form.get('email') ?? ''),
                    phone: String(form.get('phone') ?? ''),
                  });
                  done();
                });
              }}
            >
              <div className="q-row q-row-sm">
                <input className="q-input" name="name" placeholder="Name" autoFocus disabled={working} />
                <input className="q-input" name="role" placeholder="Role" disabled={working} />
              </div>
              <div className="q-row q-row-sm">
                <input className="q-input" name="email" type="email" placeholder="Email" disabled={working} />
                <input className="q-input" name="phone" type="tel" placeholder="Phone" disabled={working} />
              </div>
              <button className="q-btn q-btn-primary q-btn-sm q-start-btn" type="submit" disabled={working}>
                {working ? 'Adding' : 'Add'}
              </button>
            </form>
          )}
        </Reveal>
      </section>

      {gone.length > 0 && (
        <section className="q-stack q-stack-sm">
          <h2 className="q-section-title">Former</h2>
          <div className="q-sheet">
            {gone.map((member) => (
              <Link className="q-mate q-mate-gone" key={member.id} href={`/team/${member.id}`}>
                <span className="q-face">
                  {member.avatarPath && faces[member.avatarPath]
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={faces[member.avatarPath]} alt="" />
                    : <span className="q-face-bare">{member.name.slice(0, 1)}</span>}
                </span>

                <span className="q-mate-who">
                  <strong className="q-mate-name">{member.name}</strong>
                  <span className="q-meta-sm">{member.role ?? 'No role given'}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}

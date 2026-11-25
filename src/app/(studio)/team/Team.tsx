'use client';

import { useState, useTransition } from 'react';
import { addToTeam, theyLeft, theyReturned } from '@/weave/team/actions';
import { sayLeaving, worksHere, type TeamMember } from '@/weave/team/shape';
import { Reveal } from '@/components/Reveal';

/**
 * The people who work here.
 *
 * Crew comes from this list and nowhere else, so what it holds decides who
 * can be put on a shoot. Somebody who has left stays, quietly, because the
 * record of who photographed a wedding is worth more than a tidy list.
 */
export function Team({ members }: { members: TeamMember[] }) {
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
              <div className="q-mate" key={member.id}>
                <div className="q-mate-who">
                  <strong className="q-mate-name">{member.name}</strong>
                  <span className="q-meta-sm">
                    {[member.email, member.phone].filter(Boolean).join(' · ')
                      || 'No contact details'}
                  </span>
                </div>

                {/*
                  * What they are actually carrying. A team list that does not
                  * say who is busy is an address book.
                  */}
                <span className="q-mate-load">
                  {member.booked === 0
                    ? 'No bookings'
                    : `${member.booked} upcoming`}
                </span>

                <span className="q-mate-acts">
                  {member.hasAccount && <span className="q-meta-sm">Has account</span>}
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                    onClick={() => {
                      const warn = sayLeaving(member);
                      if (warn) setProblem(`${warn} Assignments are retained.`);
                      run(() => theyLeft({ personId: member.id }));
                    }}
                  >
                    Mark as left
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <Reveal says="Add team member">
          {(done) => (
            <form
              className="q-row q-row-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const name = String(form.get('name') ?? '').trim();
                if (!name) { setProblem('Enter a name.'); return; }
                run(async () => {
                  await addToTeam({
                    name,
                    email: String(form.get('email') ?? ''),
                    phone: String(form.get('phone') ?? ''),
                  });
                  done();
                });
              }}
            >
              <input className="q-input" name="name" autoFocus placeholder="Full name" disabled={working} />
              <input className="q-input q-input-sm" name="email" type="email" placeholder="Email" disabled={working} />
              <input className="q-input q-input-sm" name="phone" placeholder="Phone" disabled={working} />
              <button className="q-btn q-btn-secondary q-btn-sm" type="submit" disabled={working}>
                Add them
              </button>
            </form>
          )}
        </Reveal>
      </section>

      {gone.length > 0 && (
        <section className="q-stack q-stack-sm">
          <h2 className="q-section-title">Former members</h2>
          <div className="q-sheet">
            {gone.map((member) => (
              <div className="q-mate q-mate-gone" key={member.id}>
                <div className="q-mate-who">
                  <strong className="q-mate-name">{member.name}</strong>
                  <span className="q-meta-sm">
                    Left on{' '}
                    {new Date(member.leftAt!).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                </div>
                <span className="q-mate-acts">
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                    onClick={() => run(() => theyReturned({ personId: member.id }))}
                  >
                    Reinstate
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}

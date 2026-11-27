import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { facesFor, readMember, workOf } from '@/weave/team/actions';
import { sayDone, sayLoad, worksHere } from '@/weave/team/shape';
import { sayWhen } from '@/weave/bookings/shape';

export const dynamic = 'force-dynamic';

/** A date as the studio reads one. */
function on(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * One person who works here.
 *
 * IT READS AND DOES NOT CHANGE. Everything that alters them — their details,
 * their picture, their leaving — is on `/team/<id>/edit`. A form the height of
 * the screen sat here once and turned a profile into a settings page, pushing
 * the thing a studio actually comes for above a card twice its height.
 *
 * Contact leads. Who somebody is and how to reach them is the thing looked up
 * most — a number read off a phone on the way to a shoot — and the work they
 * are carrying is underneath it.
 */
export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const { id } = await params;

  /* Asked together; neither answer depends on the other. */
  const [member, work] = await Promise.all([readMember(id), workOf(id)]);
  if (!member) notFound();

  /* The bucket is private, so the URL is minted at the moment of looking. */
  const faces = await facesFor([member.avatarPath]);
  const face = member.avatarPath ? faces.get(member.avatarPath) ?? null : null;

  /*
   * SPLIT, because the heading counts what is not behind them and the list
   * used to show everything they had ever been on underneath it — so a
   * photographer with one shoot in March and one in September read as "On 1
   * booking" above two rows, oldest first, with nothing saying which was
   * which.
   *
   * Undated work sits with what is ahead: nobody has done it.
   */
  const today = new Date().toLocaleDateString('en-CA');
  const ahead = work.filter((w) => !w.on || w.on >= today);
  const before = work.filter((w) => w.on && w.on < today).reverse();

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div className="q-row q-row-sm">
          <span className="q-face q-face-lg">
            {face
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={face} alt="" />
              /* Initials, not a silhouette: a studio knows its own people by
               * name, and a grey head says nothing about anybody. */
              : <span className="q-face-bare">{member.name.slice(0, 1)}</span>}
          </span>

          <span className="q-stack q-stack-xs">
            <h1 className="q-page-title">{member.name}</h1>
            {/* The studio's own word for what they do, exactly as typed. */}
            <p className="q-page-subtitle">{member.role ?? 'No role given'}</p>
          </span>
        </div>

        <Link className="q-btn q-btn-secondary q-btn-sm" href={`/team/${member.id}/edit`}>
          Change
        </Link>
      </header>

      <div className="q-stack q-stack-md">
        {/* Said as facts, and an absence is stated rather than left blank. */}
        <section className="q-stack q-stack-xs">
          <h2 className="q-section-title">Contact</h2>
          <p className="q-text-body">{member.email ?? 'No email address'}</p>
          <p className="q-text-body">{member.phone ?? 'No phone number'}</p>
          <p className="q-meta">
            {worksHere(member)
              ? `Here since ${on(member.joinedAt)}`
              : `Left ${on(member.leftAt!)}`}
          </p>
        </section>

        <section className="q-stack q-stack-sm">
          {/* The heading is the reading: a label over a list of bookings
            * would be covering for a reading that did not announce itself. */}
          <h2 className="q-reading">{sayLoad(member)}</h2>

          {ahead.length === 0 ? (
            <p className="q-empty">
              Not on any bookings. Somebody is put on one from the booking itself.
            </p>
          ) : (
            <div className="q-stack q-stack-sm">
              {ahead.map((w) => (
                <Link
                  className="q-row q-row-between q-row-link"
                  key={w.bookingId}
                  href={`/bookings/${w.bookingId}`}
                >
                  <span className="q-stack q-stack-xs">
                    <strong className="q-strong">{w.clientName ?? 'No client'}</strong>
                    <span className="q-meta">{w.occasion ?? 'No occasion given'}</span>
                  </span>
                  <span className="q-meta">{sayWhen(w.on, w.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/*
          * What they have already done, most recent first and capped. Every
          * shoot somebody has ever been on stops being a reading and becomes
          * an archive, and nobody scrolls an archive.
          */}
        {before.length > 0 && (
          <section className="q-stack q-stack-sm">
            <h2 className="q-reading">{sayDone(before.length)}</h2>
            <div className="q-stack q-stack-sm">
              {before.slice(0, 10).map((w) => (
                <Link
                  className="q-row q-row-between q-row-link"
                  key={w.bookingId}
                  href={`/bookings/${w.bookingId}`}
                >
                  <span className="q-stack q-stack-xs">
                    <strong className="q-strong">{w.clientName ?? 'No client'}</strong>
                    <span className="q-meta">{w.occasion ?? 'No occasion given'}</span>
                  </span>
                  <span className="q-meta">{sayWhen(w.on, w.at)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

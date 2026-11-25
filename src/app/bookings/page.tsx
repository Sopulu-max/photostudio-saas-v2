import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { StudioShell } from '../StudioShell';
import { whoIsAsking } from '@/weave/studio';
import { myStudioFront, requestsAnswered, requestsWaiting } from '@/weave/jobs/requests';
import { Requests } from '../board/Requests';

export const dynamic = 'force-dynamic';

/**
 * Bookings — where work from outside lives.
 *
 * The board surfaces what is waiting, because that is urgent and the board is
 * what gets looked at. This is the room it belongs to: the address people ask
 * at, what has not been answered, and what was taken or turned away.
 *
 * The address comes first and is said even when nothing is waiting, because a
 * studio that has never shared it will never receive a request, and a page
 * that goes blank on a quiet day teaches nobody that the feature exists.
 */
export default async function BookingsPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;

  const [waiting, answered, front] = await Promise.all([
    requestsWaiting(), requestsAnswered(), myStudioFront(),
  ]);

  const taken = answered.filter((a) => a.answer === 'taken').length;
  const said = waiting.length > 0
    ? `${waiting.length} ${waiting.length === 1 ? 'request' : 'requests'} awaiting a response.`
    : answered.length === 0
      ? 'No requests yet. Share the booking page below to receive them.'
      : `No pending requests. ${taken} of ${answered.length} accepted.`;

  return (
    <StudioShell here="bookings" studioName={who.studioName}>
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
      </header>

      <div className="q-stack q-stack-lg">
        {front && (
          <section className="q-stack q-stack-xs">
            <h2 className="q-section-title">Booking page</h2>
            <span className="q-share">{origin}/s/{front.slug}</span>
            <p className="q-meta">
              Add this to your website or profile. No account is required to submit a
              request, and nothing is confirmed until you accept it.
            </p>
          </section>
        )}

        {waiting.length > 0 && <Requests waiting={waiting} origin={origin} heading={false} />}

        <section className="q-stack q-stack-sm">
          <h2 className="q-section-title">Answered</h2>
          {answered.length === 0 ? (
            <p className="q-empty">No answered requests.</p>
          ) : (
            <div className="q-sheet">
              {answered.map((ask) => (
                <div className="q-answered" key={ask.id}>
                  <div className="q-answered-main">
                    <strong className="q-strong">{ask.askedBy ?? 'Somebody'}</strong>
                    <span className="q-meta">{ask.wants ?? 'No details provided.'}</span>
                    {ask.because && <span className="q-meta-sm">Reason: {ask.because}</span>}
                  </div>
                  <span className={ask.answer === 'taken' ? 'q-answer' : 'q-answer q-answer-no'}>
                    {ask.answer === 'taken' ? 'Accepted' : 'Declined'}
                    {' · '}
                    {new Date(ask.answeredAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
    </StudioShell>
  );
}

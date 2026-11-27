import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requestAsAsked } from '@/weave/bookings/requests';

export const dynamic = 'force-dynamic';

/**
 * A request, read by the person who made it.
 *
 * The answer lives here rather than only in an email, which is what lets the
 * loop close before any mail provider exists: the studio sends this link, and
 * whatever they decide later, the page is already right. No account, no
 * sign-in — the token is the claim, the same ruling as a gallery.
 *
 * It says nothing about the studio's board or what it decided internally. A
 * refusal's recorded reason stays in the studio; only what they chose to say
 * back is here.
 */
export async function generateMetadata({ params }: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const ask = await requestAsAsked(token);
  return { title: ask ? ask.studioName : 'Not found' };
}

export default async function RequestPage({ params }: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ask = await requestAsAsked(token);
  if (!ask) notFound();

  const asked = new Date(ask.requestedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const said =
    ask.answer === 'waiting' ? 'Under review'
      : ask.answer === 'taken' ? 'Request accepted'
        : 'Request declined';

  return (
    <main className="q-auth">
      <div className="q-auth-card">
        <span className="q-auth-mark">{ask.studioName}</span>
        <h1 className="q-auth-title">{said}</h1>

        <p className="q-auth-says">
          {ask.answer === 'waiting'
            ? `Submitted ${asked}. They will respond by email.`
            : ask.answer === 'taken'
              ? `Submitted ${asked}. Accepted.`
              : `Submitted ${asked}.`}
        </p>

        {ask.answeredWith && (
          <div className="q-reply">
            <span className="q-label">Their response</span>
            <p className="q-reply-body">{ask.answeredWith}</p>
          </div>
        )}

        <div className="q-asked">
          <span className="q-label">Your request</span>
          <p className="q-reply-body">{ask.wants ?? 'No details provided.'}</p>
          {ask.askedFor && (
            <p className="q-meta">
              For{' '}
              {new Date(`${ask.askedFor}T00:00:00`).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          )}
        </div>

        {ask.answer === 'turned away' && (
          <p className="q-auth-body">
            Nothing was booked. You are welcome to{' '}
            <a className="q-auth-link" href={`/s/${ask.studioSlug}`}>submit another request</a>.
          </p>
        )}
      </div>
    </main>
  );
}

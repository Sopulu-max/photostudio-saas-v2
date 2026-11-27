import Link from 'next/link';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { clients } from '@/weave/clients/actions';
import { duplicatesOf, sayClient, sayClients, sayDuplicates } from '@/weave/clients/shape';
import { money } from '@/weave/store/shape';

export const dynamic = 'force-dynamic';

/**
 * The clients.
 *
 * `weave.people` holds everybody a studio knows; this is the half it serves,
 * and `/team` is the half it employs. Neither is a table of its own — what
 * somebody is here is derived from the edges pointing at them, and a booking
 * is the edge that makes a client.
 *
 * Nothing on this page is stored. The count of bookings, the next shoot, the
 * last one, what has been spent: every line is a second reading of something
 * the system already records elsewhere.
 */
export default async function ClientsPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const everyone = await clients();
  const duplicates = duplicatesOf(everyone);
  const said = sayDuplicates(duplicates);

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Clients</h1>
          <p className="q-page-subtitle">{sayClients(everyone)}</p>
        </div>
      </header>

      {/*
        * Duplicates, said out loud. Every public enquiry writes a new person
        * on purpose — matching a typed email would hand a stranger somebody
        * else's history — and the merge that was meant to answer for that does
        * not exist yet. A studio should hear it from the page rather than work
        * it out from a list with the same name in it three times.
        */}
      {said && <p className="q-clash">{said}</p>}

      {everyone.length === 0 ? (
        <p className="q-empty">
          No clients. A client is somebody a booking is for, so the first one
          arrives with the first booking.
        </p>
      ) : (
        /*
         * The app's own linked-row shape, not a new one. `q-answered` would
         * have fitted the geometry and is named for an answered request —
         * borrowing it here is how a class name stops meaning anything.
         */
        <div className="q-stack q-stack-sm">
          {everyone.map((client) => (
            <Link
              className="q-row q-row-between q-row-link"
              key={client.id}
              href={`/clients/${client.id}`}
            >
              <span className="q-stack q-stack-xs">
                <strong className="q-strong">{client.name}</strong>
                <span className="q-meta">{sayClient(client)}</span>
              </span>
              {client.spent > 0 && (
                <span className="q-meta">{money(client.spent, client.currency)}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

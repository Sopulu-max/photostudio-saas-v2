import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { automations, discounts, whatIsDue } from '@/weave/automations/actions';
import { StudioNav } from '../StudioNav';
import { Automations } from './Automations';

export const dynamic = 'force-dynamic';

/**
 * The messages a studio means to send.
 *
 * What is DUE comes first, because it is the only part anybody has to act on;
 * the automations and codes below it are settings, and settings can wait.
 */
export default async function AutomationsPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;

  const [list, codes, due] = await Promise.all([
    automations(),
    discounts(),
    whatIsDue(origin),
  ]);

  const said = due.length === 0
    ? list.length === 0
      ? 'Nothing set up yet.'
      : 'Nothing is due.'
    : `${due.length} ${due.length === 1 ? 'message is' : 'messages are'} due.`;

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Following up</h1>
          <p className="q-page-subtitle">{said}</p>
        </div>
        <StudioNav here="automations" />
      </header>

      <Automations due={due} automations={list} discounts={codes} />
    </div>
  );
}

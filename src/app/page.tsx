import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { StudioShell } from './StudioShell';
import { APPS, sayApp, type Standing } from './apps';
import { whoIsAsking } from '@/weave/studio';
import { readBoard } from '@/weave/jobs/actions';
import { requestsWaiting } from '@/weave/jobs/requests';
import { occasionsBetween } from '@/weave/occasions/actions';
import { packages } from '@/weave/packages/actions';
import { isPublished } from '@/weave/packages/shape';
import { team } from '@/weave/team/actions';
import { allGalleries } from '@/weave/galleries/actions';
import { allOrders } from '@/weave/store/actions';
import { standingOf } from '@/weave/store/shape';
import { theShopfront } from '@/weave/store/front';
import { whatIsDue } from '@/weave/automations/actions';

/**
 * What this studio runs on.
 *
 * A grid of screens is ordinarily a filing cabinet — ten nouns that tell an
 * operator where things are filed and nothing about their business. What
 * stops this being one is that every tile is a READING: the work outstanding,
 * the requests unanswered, the galleries not yet shared. The screens are the
 * door; the sentence under each is the reason to open it.
 *
 * And when there is nothing yet to report it says what the screen is FOR,
 * because a studio that signed up this morning needs to learn what Board
 * means before it needs to know the number is zero.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;

  const today = new Date();
  const asDay = (d: Date) => d.toLocaleDateString('en-CA');
  const inSevenDays = new Date(today);
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const [board, waiting, todays, week, offered, crew, galleries, orders, front, due] =
    await Promise.all([
      readBoard(),
      requestsWaiting(),
      occasionsBetween(asDay(today), asDay(today)),
      occasionsBetween(asDay(today), asDay(inSevenDays)),
      packages(),
      team(),
      allGalleries(),
      allOrders(),
      theShopfront(),
      whatIsDue(origin),
    ]);

  const standing: Standing = {
    activeJobs: board
      .filter((column) => column.turn !== 'done')
      .reduce((n, column) => n + column.jobs.length, 0),
    onToday: todays.length,
    nextSevenDays: week.length,
    requestsWaiting: waiting.length,
    packages: { all: offered.length, published: offered.filter(isPublished).length },
    team: crew.length,
    galleries: {
      all: galleries.length,
      shared: galleries.filter((g) => g.sharedAt !== null).length,
    },
    ordersNeedingAttention: orders.filter((order) => standingOf(order) !== 'done').length,
    picturesForSale: front.buyable,
    messagesDue: due.length,
  };

  return (
    <StudioShell here="home" studioName={who.studioName}>
      <div className="q-page">
        <header className="q-page-header">
          <div>
            <h1 className="q-page-title">{who.studioName}</h1>
            <p className="q-page-subtitle">
              {standing.activeJobs === 0 && standing.requestsWaiting === 0
                ? 'Nothing on. Take a booking, or add a job.'
                : sayApp(APPS[0], standing)}
            </p>
          </div>
        </header>

        <div className="q-apps">
          {APPS.map((app) => (
            <Link key={app.key} href={app.href} className="q-app">
              {/*
                * The icon carries its own ground. A glyph floating on the
                * card reads as decoration on a list item; a mark inside a
                * tile reads as a thing you open, which is what it is.
                */}
              <span className="q-app-mark"><app.Icon aria-hidden="true" /></span>
              <strong className="q-app-name">{app.label}</strong>
              <span className="q-app-says">{sayApp(app, standing)}</span>
            </Link>
          ))}
        </div>
      </div>
    </StudioShell>
  );
}

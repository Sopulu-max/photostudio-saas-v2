import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APPS, sayApp, type Standing } from '../apps';
import { whoIsAsking } from '@/weave/studio';
import { theDashboard } from '@/weave/dashboard/actions';
import { outstanding, sayStanding } from '@/weave/dashboard/shape';
import { packages } from '@/weave/packages/actions';
import { isPublished } from '@/weave/packages/shape';
import { team } from '@/weave/team/actions';
import { clients } from '@/weave/clients/actions';
import { theCalendar } from '@/weave/calendar/actions';
import { allGalleries } from '@/weave/galleries/actions';
import { allOrders } from '@/weave/store/actions';
import { standingOf } from '@/weave/store/shape';
import { theShopfront } from '@/weave/store/front';
import { deliverables } from '@/weave/deliverables/actions';
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

  /*
   * The dashboard's own readings, so the tile and the page behind it can
   * never disagree about how much is outstanding — and so neither reads
   * `bookings.turn`. It also answers "requests unanswered", which used to be a
   * query of its own here.
   */
  const [board, week, offered, crew, served, galleries, orders, front, due, made] =
    await Promise.all([
      theDashboard(asDay(today)),
      theCalendar(asDay(today), asDay(inSevenDays)),
      packages(),
      team(),
      clients(),
      allGalleries(),
      allOrders(),
      theShopfront(),
      whatIsDue(origin),
      deliverables(),
    ]);

  const standing: Standing = {
    outstanding: outstanding(board),
    requestsWaiting: board.unanswered.length,
    nextSevenDays: week.filter((e) => e.kind === 'shoot').length,
    deliverables: {
      files: made.filter((d) => d.kind === 'digital').length,
      objects: made.filter((d) => d.kind === 'physical').length,
    },
    packages: { all: offered.length, published: offered.filter(isPublished).length },
    team: crew.length,
    clients: served.length,
    galleries: {
      all: galleries.length,
      shared: galleries.filter((g) => g.sharedAt !== null).length,
    },
    ordersNeedingAttention: orders.filter((order) => standingOf(order) !== 'done').length,
    picturesForSale: front.buyable,
    messagesDue: due.length,
  };

  return (
      <div className="q-page">
        <header className="q-page-header">
          <div>
            <h1 className="q-page-title">{who.studioName}</h1>
            <p className="q-page-subtitle">
              {sayStanding(board)}
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
  );
}

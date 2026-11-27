import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CalendarDays, CalendarPlus, Images, ShoppingBag } from 'lucide-react';
import { theDashboard, upcomingDeadlines, upcomingShoots } from '@/weave/dashboard/actions';
import {
  sayNotHandedOver, sayNotSent, sayShortOfPromise, sayStanding,
  sayUnanswered, sayWaiting, scheduleThrough, staffingGaps,
  type Dashboard, type GalleryDeadline, type ScheduledShoot,
} from '@/weave/dashboard/shape';

export const dynamic = 'force-dynamic';

const fullDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const shortDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
});
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function Summary({ work }: { work: Dashboard }) {
  const delivery = [
    work.notHandedOver.length > 0 && sayNotHandedOver(work.notHandedOver),
    work.shortOfPromise.length > 0 && sayShortOfPromise(work.shortOfPromise),
  ].filter(Boolean).join(' · ');
  const items = [
    {
      title: 'Booking requests',
      href: work.unanswered.length > 0 ? '/bookings#requests' : '/bookings',
      Icon: CalendarPlus,
      reading: sayUnanswered(work.unanswered), pending: work.unanswered.length > 0,
    },
    {
      title: 'Gallery delivery', href: '/galleries', Icon: Images,
      reading: delivery || 'No deliveries outstanding', pending: Boolean(delivery),
    },
    {
      title: 'Order fulfilment', href: '/orders', Icon: ShoppingBag,
      reading: sayNotSent(work.notSent), pending: work.notSent.length > 0,
    },
  ];

  return (
    <div className="q-dashboard-summary">
      {items.map(({ title, href, Icon, reading, pending }) => (
        <Link className="q-card q-dashboard-stat" href={href} key={title}>
          <span className="q-dashboard-stat-label">
            <Icon aria-hidden="true" />
            {title}
            <ArrowRight className="q-dashboard-stat-arrow" aria-hidden="true" />
          </span>
          <span className={pending ? 'q-dashboard-stat-reading q-warm' : 'q-dashboard-stat-reading'}>
            {reading}
          </span>
        </Link>
      ))}
    </div>
  );
}

function Schedule({ today, shoots }: { today: string; shoots: ScheduledShoot[] | null }) {
  const byDay = new Map<string, ScheduledShoot[]>();
  for (const shoot of shoots ?? []) {
    const day = byDay.get(shoot.on) ?? [];
    day.push(shoot);
    byDay.set(shoot.on, day);
  }

  return (
    <section className="q-card q-dashboard-panel" aria-labelledby="dashboard-schedule">
      <div className="q-dashboard-panel-head">
        <div className="q-stack q-stack-xs">
          <h2 className="q-dashboard-heading" id="dashboard-schedule">Shoot schedule</h2>
          <p className="q-note">Today through {shortDate.format(asDate(scheduleThrough(today)))}</p>
        </div>
        <Link className="q-btn q-btn-ghost q-btn-xs" href="/calendar">
          <CalendarDays aria-hidden="true" /> View calendar
        </Link>
      </div>

      {shoots === null ? (
        <p className="q-note q-note-bad">Schedule unavailable</p>
      ) : shoots.length === 0 ? (
        <p className="q-empty">No shoots scheduled</p>
      ) : (
        <div className="q-dashboard-days">
          {[...byDay].map(([date, entries]) => (
            <section className="q-dashboard-day" key={date}>
              <h3 className="q-dashboard-day-title">
                <time dateTime={date}>{date === today ? 'Today' : shortDate.format(asDate(date))}</time>
              </h3>
              {entries.map((shoot) => (
                <Link className="q-row-link q-dashboard-shoot" key={shoot.id} href={`/bookings/${shoot.id}`}>
                  <span className="q-dashboard-time">{shoot.at?.slice(0, 5) ?? 'No time set'}</span>
                  <span className="q-dashboard-row-label">
                    <strong className="q-strong">{shoot.occasion ?? shoot.clientName ?? 'Booking'}</strong>
                    {shoot.occasion && shoot.clientName && <span className="q-meta">{shoot.clientName}</span>}
                    <span className={shoot.needsCrew ? 'q-meta-sm q-warm' : 'q-meta-sm'}>
                      {shoot.crew.join(', ') || 'No crew assigned'}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function QueueRow({ href, title, detail }: { href: string; title: string; detail: ReactNode }) {
  return (
    <Link href={href} className="q-row-link q-dashboard-queue-row">
      <span className="q-dashboard-row-label">
        <strong className="q-strong">{title}</strong>
        <span className="q-meta">{detail}</span>
      </span>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function galleryLink(bookingId: string | null, galleryId: string) {
  return bookingId ? `/bookings/${bookingId}#gallery-${galleryId}` : '/galleries';
}

const hubLabels = {
  selection: 'Selection due',
  album: 'Album review due',
  retouch: 'Retouching request due',
  approval: 'Approval due',
};

function Deadlines({ today, deadlines }: { today: string; deadlines: GalleryDeadline[] | null }) {
  return (
    <section className="q-card q-dashboard-panel" aria-labelledby="dashboard-deadlines">
      <div className="q-dashboard-panel-head">
        <div className="q-stack q-stack-xs">
          <h2 className="q-dashboard-heading" id="dashboard-deadlines">Upcoming deadlines</h2>
          <p className="q-note">Today through {shortDate.format(asDate(scheduleThrough(today)))}</p>
        </div>
      </div>
      {deadlines === null ? (
        <p className="q-note q-note-bad">Deadlines unavailable</p>
      ) : deadlines.length === 0 ? (
        <p className="q-empty">No deadlines in the next seven days</p>
      ) : (
        <div className="q-dashboard-queue">
          {deadlines.map(({ gallery, ...deadline }) => {
            const label = deadline.kind === 'hub' ? hubLabels[deadline.purpose]
              : deadline.kind === 'selection' ? 'Client selection due' : 'Gallery expiry';
            const target = deadline.kind === 'hub' ? 'gallery-hub'
              : deadline.kind === 'selection' ? 'gallery-selections' : 'gallery-expiry';
            const href = gallery.bookingId
              ? `/bookings/${gallery.bookingId}#${target}-${gallery.id}` : '/galleries';

            return (
              <QueueRow
                key={`${deadline.kind}-${deadline.id}`}
                href={href}
                title={deadline.title}
                detail={(
                  <>
                    {label} ·{' '}
                    <time dateTime={deadline.on} className={deadline.on === today ? 'q-warm' : undefined}>
                      {deadline.on === today ? 'Today' : shortDate.format(asDate(deadline.on))}
                    </time>
                    {deadline.kind !== 'expiry' && ` · ${gallery.name}`}
                  </>
                )}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function WorkQueue({ work, today, unstaffed }: {
  work: Dashboard | null;
  today: Date;
  unstaffed: ScheduledShoot[] | null;
}) {
  return (
    <section className="q-card q-dashboard-panel" aria-labelledby="dashboard-queue">
      <div className="q-dashboard-panel-head">
        <h2 className="q-dashboard-heading" id="dashboard-queue">Needs attention</h2>
      </div>

      <div className="q-dashboard-queue">
        <p className="q-note">{work ? sayStanding(work, unstaffed?.length ?? null) : 'Outstanding items unavailable'}</p>
        {unstaffed?.map((shoot) => (
          <QueueRow
            key={`crew-${shoot.id}`}
            href={`/bookings/${shoot.id}#booking-crew`}
            title={shoot.occasion ?? shoot.clientName ?? 'Booking'}
            detail={[
              shoot.occasion && shoot.clientName,
              `No crew assigned · ${shortDate.format(asDate(shoot.on))}`,
            ].filter(Boolean).join(' · ')}
          />
        ))}
        {work && <>
          {work.unanswered.map((request) => (
            <QueueRow
              key={request.id}
              href={`/bookings#request-${request.id}`}
              title={request.clientName ?? 'Unnamed client'}
              detail={[
                request.wants,
                `Request awaiting reply · ${sayWaiting(request.requestedAt, today)}`,
              ].filter(Boolean).join(' · ')}
            />
          ))}
          {work.unscheduled.map((booking) => (
            <QueueRow
              key={`date-${booking.id}`}
              href={`/bookings/${booking.id}#on`}
              title={booking.occasion ?? booking.clientName ?? 'Booking'}
              detail={[
                booking.occasion && booking.clientName,
                'Confirmed booking · No shoot date set',
              ].filter(Boolean).join(' · ')}
            />
          ))}
          {work.notHandedOver.map((gallery) => (
            <QueueRow
              key={gallery.galleryId}
              href={galleryLink(gallery.bookingId, gallery.galleryId)}
              title={gallery.galleryName}
              detail={[
                gallery.clientName,
                `Unshared gallery · ${gallery.have} ${gallery.have === 1 ? 'file' : 'files'}`,
              ].filter(Boolean).join(' · ')}
            />
          ))}
          {work.shortOfPromise.map((gallery) => (
            <QueueRow
              key={gallery.galleryId}
              href={galleryLink(gallery.bookingId, gallery.galleryId)}
              title={gallery.name}
              detail={`Shared gallery · ${gallery.have} of ${gallery.promised} promised files`}
            />
          ))}
          {work.notSent.map((order) => (
            <QueueRow
              key={order.id}
              href={`/orders#order-${order.id}`}
              title={order.clientName ?? 'Unnamed customer'}
              detail={`Paid order awaiting fulfilment · ${sayWaiting(order.paidAt, today)}`}
            />
          ))}
        </>}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA');
  const [work, shoots, deadlines] = await Promise.all([
    theDashboard(), upcomingShoots(today), upcomingDeadlines(today),
  ]);
  const unstaffed = shoots ? staffingGaps(shoots) : null;

  return (
    <div className="q-page q-dashboard">
      <header className="q-page-header">
        <div className="q-dashboard-title">
          <h1 className="q-page-title">Dashboard</h1>
          <p className="q-page-subtitle"><time dateTime={today}>{fullDate.format(asDate(today))}</time></p>
        </div>
        <Link className="q-btn q-btn-primary q-btn-sm" href="/bookings/new">New booking</Link>
      </header>

      {work && <Summary work={work} />}
      <div className="q-dashboard-body">
        <div className="q-stack">
          <Schedule today={today} shoots={shoots} />
          <Deadlines today={today} deadlines={deadlines} />
        </div>
        <WorkQueue work={work} today={asDate(today)} unstaffed={unstaffed} />
      </div>
    </div>
  );
}

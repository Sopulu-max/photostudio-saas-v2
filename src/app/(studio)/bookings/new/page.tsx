import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { packages } from '@/weave/packages/actions';
import { mediaForPackages } from '@/weave/packages/media';
import { elementsOf, catalogueOf } from '@/weave/packages/promised';
import { whoCouldBeOnIt } from '@/weave/crew/actions';
import { TakeBooking } from './TakeBooking';

export const dynamic = 'force-dynamic';

/**
 * Taking a booking, on a page of its own.
 *
 * A static segment, so it is matched before `/bookings/[id]` and no booking
 * can ever be reached at this address.
 *
 * The catalogue is read here rather than in the form because what the studio
 * sells is the studio's data, and a client component has no business asking
 * for it. Its elements and the deliverables they point at come with it,
 * because what a package PROMISES is counted off them and never read from a
 * column somebody typed.
 */
export default async function NewBookingPage({
  searchParams,
}: {
  /* `?on=2026-12-13`, carried from a day pressed on the calendar. */
  searchParams: Promise<{ on?: string }>;
}) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const { on } = await searchParams;
  /* Validated rather than trusted: it arrives in a URL anybody can type. */
  const day = /^\d{4}-\d{2}-\d{2}$/.test(on ?? '') ? on! : '';

  const catalogue = await packages();
  const ids = catalogue.map((p) => p.id);

  /* Asked together: none of the three depends on another. */
  const [elements, deliverables, media, team] = await Promise.all([
    elementsOf(who.studioId, ids),
    catalogueOf(who.studioId),
    mediaForPackages(ids),
    whoCouldBeOnIt(),
  ]);

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">New booking</h1>
        </div>
      </header>

      <TakeBooking
        catalogue={catalogue}
        elements={elements}
        deliverables={deliverables}
        media={media}
        team={team}
        day={day}
      />
    </div>
  );
}

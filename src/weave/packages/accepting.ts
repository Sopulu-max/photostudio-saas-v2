import 'server-only';

import { weave as db } from '@/weave/db';
import { designFrom, readTemplate, writeSections } from '@/weave/galleries/seeding';

/**
 * What accepting a booking brings into existence.
 *
 * This is the whole argument made concrete. A package that merely DESCRIBES
 * "400 finished pictures" is a sentence, and the system can do nothing with a
 * sentence. A package that PRODUCES a gallery — named, attached to the booking,
 * carrying the promised number — has turned the agreement into an object with
 * a shape, which is what everything downstream can then read.
 *
 * Called at the moment of acceptance, from both directions: a request the
 * studio takes on, and a booking the studio makes itself.
 */

/** The number is copied, never looked up later. Changing a package must not
 *  reach backwards into what somebody was already told. */
export async function galleryForAcceptedJob(input: {
  studioId: string;
  bookingId: string;
  /** For the gallery's name. A client's own name is what they will recognise. */
  clientName: string | null;
  actorId: string | null;
}): Promise<{ galleryId: string | null }> {
  /*
   * Never a second one. Acceptance can be reached twice — a studio reopening
   * a request, a retry after a failure — and a booking with two empty galleries
   * is worse than one.
   */
  const { count } = await db.from('galleries')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', input.studioId).eq('booking_id', input.bookingId);
  if ((count ?? 0) > 0) return { galleryId: null };

  /*
   * Two things come off the package: how many pictures were promised, and
   * what shape the gallery starts in. The count is copied because it is what
   * was agreed; the template is READ now and its contents copied in, so
   * editing the template later changes the next gallery and never this one.
   *
   * The count is COUNTED off the package's layout rather than read from
   * `packages.pictures_promised`. That column was a number typed beside the
   * layout, which meant a package could show four picture slots and promise
   * six, and the typed six would be what arrived. The layout is now the only
   * place the promise exists, so the two cannot disagree. The column is left
   * in place and unread — expand, deploy, contract.
   */
  const [firstPackage, imagePromise] = await Promise.all([
    db.from('booking_packages').select('package:packages(gallery_template_id)')
      .eq('studio_id', input.studioId).eq('booking_id', input.bookingId)
      .order('position').limit(1).maybeSingle().throwOnError(),
    db.rpc('booking_promised_pictures', { p_studio_id: input.studioId, p_booking_id: input.bookingId }).throwOnError(),
  ]);
  const first = firstPackage.data as unknown as { package: { gallery_template_id: string | null } | null } | null;
  const templateId = first?.package?.gallery_template_id ?? null;
  const promised = imagePromise.data as number | null;

  /*
   * A template that has since been deleted is not worth refusing an
   * acceptance over. Null means the gallery is born plain, which is what it
   * did before any of this existed.
   */
  const template = await readTemplate(input.studioId, templateId);

  const { data: gallery, error } = await db.from('galleries').insert({
    studio_id: input.studioId,
    booking_id: input.bookingId,
    name: input.clientName ? `${input.clientName}'s pictures` : 'Their pictures',
    pictures_promised: promised,
    ...designFrom(template),
  }).select('id').single();

  if (error || !gallery) {
    /*
     * Not fatal. The booking is the thing that was agreed; the gallery is a
     * convenience created alongside it, and a studio can still make one by
     * hand. Failing the acceptance over this would lose the agreement.
     */
    console.error('Could not open a gallery for the accepted booking:', error);
    return { galleryId: null };
  }

  /*
   * Sections, which this path never wrote. A gallery with none cannot be
   * filled — `fillGallery` takes a section to put the pictures in — so until
   * now the gallery a package produced had to be repaired by hand before it
   * could hold anything.
   */
  await writeSections({
    studioId: input.studioId, galleryId: gallery.id, template,
  });

  await db.from('events').insert({
    studio_id: input.studioId,
    subject_type: 'gallery',
    subject_id: gallery.id,
    action: 'opened_on_acceptance',
    actor_id: input.actorId,
    payload: { booking: input.bookingId, promised, template: templateId },
  });

  return { galleryId: gallery.id };
}

'use server';

import { weave as db } from '@/weave/db';

/**
 * What accepting a booking brings into existence.
 *
 * This is the whole argument made concrete. A package that merely DESCRIBES
 * "400 finished pictures" is a sentence, and the system can do nothing with a
 * sentence. A package that PRODUCES a gallery — named, attached to the job,
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
  jobId: string;
  /** For the gallery's name. A client's own name is what they will recognise. */
  clientName: string | null;
  packageId: string | null;
  actorId: string | null;
}): Promise<{ galleryId: string | null }> {
  /*
   * Never a second one. Acceptance can be reached twice — a studio reopening
   * a request, a retry after a failure — and a job with two empty galleries
   * is worse than one.
   */
  const { count } = await db.from('galleries')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', input.studioId).eq('job_id', input.jobId);
  if ((count ?? 0) > 0) return { galleryId: null };

  let promised: number | null = null;
  if (input.packageId) {
    const { data: pack } = await db.from('packages')
      .select('pictures_promised').eq('id', input.packageId)
      .eq('studio_id', input.studioId).maybeSingle();
    promised = pack?.pictures_promised ?? null;
  }

  const { data: gallery, error } = await db.from('galleries').insert({
    studio_id: input.studioId,
    job_id: input.jobId,
    name: input.clientName ? `${input.clientName}'s pictures` : 'Their pictures',
    pictures_promised: promised,
  }).select('id').single();

  if (error || !gallery) {
    /*
     * Not fatal. The booking is the thing that was agreed; the gallery is a
     * convenience created alongside it, and a studio can still make one by
     * hand. Failing the acceptance over this would lose the agreement.
     */
    console.error('Could not open a gallery for the accepted job:', error);
    return { galleryId: null };
  }

  await db.from('events').insert({
    studio_id: input.studioId,
    subject_type: 'gallery',
    subject_id: gallery.id,
    action: 'opened_on_acceptance',
    actor_id: input.actorId,
    payload: { job: input.jobId, promised },
  });

  return { galleryId: gallery.id };
}

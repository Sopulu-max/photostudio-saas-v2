'use server';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type {
  Dashboard, NotHandedOver, NotInTheDiary, NotSent, ShortOfPromise, TodayShoot, UnansweredRequest,
} from './shape';

/**
 * Six questions, asked of the database directly.
 *
 * Every one is scoped to the asking studio. None of them reads `jobs.turn` —
 * a column somebody sets by hand is a claim about the work, and these are
 * readings OF the work: a shoot that happened, a gallery never shared, an
 * order paid and not sent. If the studio stops maintaining `turn` tomorrow,
 * every line here is still true.
 *
 * Read in parallel because they are independent, and a dashboard that waits
 * for the slowest of six in sequence is six waits instead of one.
 */

const EMPTY: Dashboard = {
  today: [], unanswered: [], notInTheDiary: [],
  notHandedOver: [], shortOfPromise: [], notSent: [],
};

export async function theDashboard(today: string): Promise<Dashboard> {
  const who = await whoIsAsking();
  if (!who) return EMPTY;
  const studio = who.studioId;

  const [shoots, waiting, accepted, happened, galleries, orders] = await Promise.all([
    /* What is on today, and who is on it. */
    db.from('occasions')
      .select('id, job_id, what, starts_at, ends_at, job:jobs(client:people(name)), crew:crew(person:people(name))')
      .eq('studio_id', studio).eq('on_date', today)
      .order('starts_at', { ascending: true, nullsFirst: true }),

    /* Asked, and not yet answered either way. */
    db.from('jobs')
      .select('id, wants, requested_at, client:people(name)')
      .eq('studio_id', studio)
      .not('requested_at', 'is', null)
      .is('accepted_at', null).is('declined_at', null)
      .order('requested_at', { ascending: true }),

    /*
     * Agreed work, with its shoots. The absence is found here rather than in
     * SQL: PostgREST has no "where not exists", and asking for every
     * accepted job with its occasions and filtering in memory is honest at
     * a studio's scale and wrong at nobody's.
     */
    db.from('jobs')
      .select('id, wants, accepted_at, client:people(name), occasions:occasions(id)')
      .eq('studio_id', studio)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: true }),

    /* Shot. Whether it went out is the next question. */
    db.from('occasions')
      .select('id, job_id, happened_at, job:jobs(client:people(name), galleries:galleries(id, name, shared_at))')
      .eq('studio_id', studio)
      .not('happened_at', 'is', null)
      .order('happened_at', { ascending: true }),

    /* Handed over, against what was agreed. */
    db.from('galleries')
      .select('id, job_id, name, pictures_promised, shared_at, files:gallery_files(id)')
      .eq('studio_id', studio)
      .not('pictures_promised', 'is', null)
      .not('shared_at', 'is', null),

    /* Paid for and still here. */
    db.from('orders')
      .select('id, paid_at, person:people(name)')
      .eq('studio_id', studio)
      .not('paid_at', 'is', null)
      .is('fulfilled_at', null)
      .order('paid_at', { ascending: true }),
  ]);

  for (const [what, result] of Object.entries({
    shoots, waiting, accepted, happened, galleries, orders,
  })) {
    if (result.error) console.error(`Dashboard could not read ${what}:`, result.error);
  }

  type NamedJob = { client: { name: string } | null } | null;

  const todayShoots: TodayShoot[] = ((shoots.data ?? []) as unknown as {
    id: string; job_id: string; what: string | null;
    starts_at: string | null; ends_at: string | null;
    job: NamedJob; crew: { person: { name: string } | null }[];
  }[]).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    what: row.what,
    clientName: row.job?.client?.name ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    crew: (row.crew ?? []).map((c) => c.person?.name).filter((n): n is string => Boolean(n)),
  }));

  const unanswered: UnansweredRequest[] = ((waiting.data ?? []) as unknown as {
    id: string; wants: string | null; requested_at: string; client: { name: string } | null;
  }[]).map((row) => ({
    id: row.id, wants: row.wants, requestedAt: row.requested_at,
    clientName: row.client?.name ?? null,
  }));

  const notInTheDiary: NotInTheDiary[] = ((accepted.data ?? []) as unknown as {
    id: string; wants: string | null; accepted_at: string;
    client: { name: string } | null; occasions: { id: string }[];
  }[])
    .filter((row) => (row.occasions ?? []).length === 0)
    .map((row) => ({
      id: row.id, wants: row.wants, acceptedAt: row.accepted_at,
      clientName: row.client?.name ?? null,
    }));

  /*
   * One line per JOB, not per shoot. A wedding with three days that has not
   * been delivered is one thing undone, and saying it three times would
   * make a studio think it was three.
   */
  const seenJobs = new Set<string>();
  const notHandedOver: NotHandedOver[] = ((happened.data ?? []) as unknown as {
    id: string; job_id: string; happened_at: string;
    job: {
      client: { name: string } | null;
      galleries: { id: string; name: string; shared_at: string | null }[];
    } | null;
  }[])
    .filter((row) => {
      const shared = (row.job?.galleries ?? []).some((g) => g.shared_at !== null);
      if (shared || seenJobs.has(row.job_id)) return false;
      seenJobs.add(row.job_id);
      return true;
    })
    .map((row) => {
      const gallery = (row.job?.galleries ?? [])[0] ?? null;
      return {
        jobId: row.job_id,
        clientName: row.job?.client?.name ?? null,
        galleryId: gallery?.id ?? null,
        galleryName: gallery?.name ?? null,
        happenedAt: row.happened_at,
      };
    });

  const shortOfPromise: ShortOfPromise[] = ((galleries.data ?? []) as unknown as {
    id: string; job_id: string | null; name: string;
    pictures_promised: number; files: { id: string }[];
  }[])
    .map((row) => ({
      galleryId: row.id, jobId: row.job_id, name: row.name,
      have: (row.files ?? []).length, promised: row.pictures_promised,
    }))
    .filter((row) => row.have < row.promised);

  const notSent: NotSent[] = ((orders.data ?? []) as unknown as {
    id: string; paid_at: string; person: { name: string } | null;
  }[]).map((row) => ({
    id: row.id, paidAt: row.paid_at, clientName: row.person?.name ?? null,
  }));

  return { today: todayShoots, unanswered, notInTheDiary, notHandedOver, shortOfPromise, notSent };
}

import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * The studio a test runs inside, seeded so that a failure to seed SAYS SO.
 *
 * Every suite wrote these three inserts by hand and checked at most one of
 * them. When the organization or the actor failed to insert — a transient
 * refusal from a shared remote database is enough — the run carried on into a
 * `contact!.id` that was null, threw somewhere unrelated, and took every test
 * in the file down with it.
 *
 * That is how task-flow reported "9 failed (9)" twice and passed on the next
 * run: not nine broken behaviours, one unchecked insert. And an all-fail with
 * no message is worse than an all-fail with one, because a suite nobody trusts
 * gates nothing — which is how a red run got pushed.
 *
 * So: one place, every error checked, and each failure named for the row that
 * could not be written.
 */
export async function seedStudio(input: {
  orgId: string;
  /** The contact every write in the suite is attributed to. */
  actorId: string;
  name: string;
  /** Most suites need somewhere for a booking to land. */
  stages?: boolean;
}) {
  const { error: orgError } = await supabaseAdmin.from('organizations').insert({
    id: input.orgId, name: input.name, status: 'active',
  });
  if (orgError) throw new Error(`Could not seed the studio "${input.name}": ${orgError.message}`);

  /*
   * logEvent refuses to record an event it cannot attribute, so without this
   * the first domain call fails with "failed to persist event" — a message
   * about the log, a long way from the missing row that caused it.
   */
  const { error: actorError } = await supabaseAdmin.from('contacts').insert({
    id: input.actorId, organization_id: input.orgId, display_name: `${input.name} Owner`,
  });
  if (actorError) throw new Error(`Could not seed the actor for "${input.name}": ${actorError.message}`);

  if (input.stages !== false) {
    /*
     * Every object in a bulk insert must carry the SAME keys — PostgREST
     * answers PGRST102 "All object keys must match" otherwise, and an ignored
     * error here reads later as "no booking stages configured for this studio".
     */
    const { error: stageError } = await supabaseAdmin.from('booking_stages').insert([
      { organization_id: input.orgId, name: 'Enquiry', kind: 'enquiry', position: 0, is_default: true },
      { organization_id: input.orgId, name: 'Booked', kind: 'booked', position: 1, is_default: false },
    ]);
    if (stageError) throw new Error(`Could not seed booking stages for "${input.name}": ${stageError.message}`);
  }
}

/**
 * Insert a row and hand back what was written, or say which row failed.
 *
 * Replaces the `(await …).data!.id` that suites reach for during setup. The
 * non-null assertion turns a refused insert into a null dereference several
 * lines later, which is the difference between "employees: violates foreign
 * key" and "Cannot read properties of null".
 */
export async function seedRow<T extends Record<string, unknown>>(
  table: string, row: T, label = table,
): Promise<any> {
  const { data, error } = await supabaseAdmin.from(table).insert(row).select().single();
  if (error || !data) throw new Error(`Could not seed ${label}: ${error?.message ?? 'nothing came back'}`);
  return data;
}

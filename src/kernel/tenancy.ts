import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * That the rows a write points at are this studio's.
 *
 * THE HOLE THIS CLOSES. Every write in this app sets `organization_id` from the
 * session, which is correct and is not the problem. The problem is the other
 * ids in the same row. `bookingId`, `employeeId`, `taskId`, `contactId` arrive
 * from the client, and a foreign key only proves that a row with that id exists
 * *somewhere* — never whose it is. Postgres will happily accept a row stamped
 * with studio A's `organization_id` and studio B's `booking_id`, because that
 * is exactly what the constraints describe.
 *
 * WHY RLS DOES NOT CATCH IT. These writes run through the service role, which
 * exists precisely to bypass row-level security. The "Tenant Isolation" policy
 * on every table is real but it is guarding the wrong door: it constrains what
 * a client-side session may read, not what the server writes on its behalf.
 *
 * WHY IT IS REACHABLE. Every module's `domain.ts` is a `'use server'` file, and
 * Next's own guidance is unambiguous about what that means — treat Server
 * Actions "as reachable via direct POST requests and verify authentication and
 * authorization inside each one" (`docs/01-app/02-guides/data-security.md`).
 * Being called only from our own forms is not a defence.
 *
 * WHY IT TAKES orgId RATHER THAN READING THE SESSION. Two paths have no session
 * to read: a client signing a contract on a share link, and the public booking
 * form. Those resolve the studio from a slug or a token and pass it down, and
 * they need this check more than anyone, not less. Passing the org in makes the
 * guard usable there and turns the question into one of self-consistency: does
 * this booking actually belong to the studio this write claims to be for.
 *
 * Ids that are absent are skipped, not rejected — an optional link that was
 * never supplied is not a violation. Checks run together, because a write with
 * four references should cost one round trip, not four.
 */
export type OwnedRef = {
  /** Table to look the id up in. Must carry `organization_id`. */
  table: string;
  /** The id from client input. Null or undefined means "not supplied" — skipped. */
  id?: string | null;
  /** What to call it if it isn't ours: "booking", "team member", "task". */
  label: string;
};

export async function assertOurs(orgId: string, refs: OwnedRef[]): Promise<void> {
  const supplied = refs.filter((r) => !!r.id);
  if (supplied.length === 0) return;

  const results = await Promise.all(
    supplied.map(async (ref) => {
      const { data, error } = await supabaseAdmin
        .from(ref.table)
        .select('id')
        .eq('id', ref.id as string)
        .eq('organization_id', orgId)
        .maybeSingle();
      return { ref, found: !!data, error };
    }),
  );

  for (const { ref, found, error } of results) {
    if (found) continue;
    // A failed lookup and a foreign row are refused alike. If we cannot show
    // the row is ours, we have not shown it is ours — and a malformed id
    // arrives here as an error, not as a miss.
    if (error) console.error(`Ownership check failed on ${ref.table}:`, error);
    throw new Error(`That ${ref.label} does not belong to this studio.`);
  }
}

/**
 * The same question for a list of ids in one table.
 *
 * Relinking a package or a service replaces whole sets at once — the services
 * it bundles, the outputs it promises, the values it is classified by — and
 * every id in those arrays comes from the client. Checking them one at a time
 * would be one round trip per id on a form that can carry dozens, so this asks
 * once and compares counts.
 *
 * Counting is enough because ids are unique: if every id we asked for came back
 * inside this organization, the set is ours. Duplicates are collapsed first so
 * a repeated id cannot make the count agree by accident.
 */
export async function assertAllOurs(
  orgId: string,
  table: string,
  ids: (string | null | undefined)[] | null | undefined,
  label: string,
): Promise<void> {
  const wanted = [...new Set((ids || []).filter(Boolean) as string[])];
  if (wanted.length === 0) return;

  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('organization_id', orgId)
    .in('id', wanted);

  if (error) {
    console.error(`Ownership check failed on ${table}:`, error);
    throw new Error(`Could not confirm those ${label} belong to this studio.`);
  }
  if ((data || []).length !== wanted.length) {
    throw new Error(`One of those ${label} does not belong to this studio.`);
  }
}

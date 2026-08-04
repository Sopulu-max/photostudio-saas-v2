# 09. System Contracts

> **Revision note:** this document previously specified state machines and
> command contracts for the retired entity model (Intent, Agreement,
> Workflow, Asset, Resource) and pointed at file paths that no longer exist
> (`src/lib/actions/*`). The five contract principles below were true then
> and are still enforced today, verified against the actual codebase — only
> the entities and file locations changed. Logic now lives in
> `src/modules/<name>/domain.ts`, exposed only through `interface.ts`. See
> [00-FRAMEWORK](00-FRAMEWORK.md) for the module map.

This document is the authoritative reference for how the system's real
entities mutate, what events they emit, and what constraints are enforced.
Code that creates or modifies a module's data should conform to this.

---

## Contract principles

1. **Commands, not updates.** State mutations are named functions
   (`activateContract`, `settleTransaction`, `setBookingStage`), not generic
   CRUD. Each has one responsibility and lives in its owning module's
   `domain.ts`.
2. **Every mutation emits an event.** A successful state change writes a row
   to `events` (`entity_type`, `entity_id`, `action`, `actor_id`, `payload`).
   Verified by audit: every domain function that mutates state calls
   `logEvent`.
3. **Side effects are explicit, never automatic.** Activating a contract
   does not spawn work or raise an invoice by itself — an operator does that
   as a separate, deliberate action from the booking hub. This is
   composition over orchestration: the system surfaces what *could* happen
   next; a person decides if it does. (The old model's `activateAgreement`
   auto-spawning a workflow and a deposit invoice was replaced by this on
   purpose.)
4. **Tenant isolation is mandatory.** Every query is scoped by
   `organization_id`, resolved via `getAuthOrgId()` — never a blind
   `.limit(1)`, never trusting a client-supplied org id. Every dashboard and
   portal page declares `export const dynamic = 'force-dynamic'`.
5. **Nothing is silently deleted.** Retiring a service, archiving a client,
   voiding a transaction — all status changes, never row deletion. The one
   deliberate exception is `mergeClientInto`-style data correction, which
   was built, then removed by product decision (see memory
   `finances-scope-decisions` and the Clients module history) — the
   principle held even when the feature didn't survive.

---

## Real state machines (verified against migrations + domain code)

### Contract (`contracts.status`)
```
proposed → active      (operator activates; sets signed_at)
         → cancelled
active   → modified     (version increments, terms change)
         → completed
modified → active
```

### Financial Transaction (`financial_transactions.status`)
```
created → pending → settled   (money received)
                  → voided
```
Never deleted — a refund is a new `outbound` transaction, not a reversal of
an existing row.

### Task (`tasks.status`)
```
created → assigned → in_progress → completed
                    → blocked → in_progress
```
A task belongs to a `booking_line_id` (not a workflow — that container was
dropped). Assignment is a separate `assignments` row, not a column on the
task.

### Client (`clients.status`)
```
active ⇄ archived
```
Archiving removes a client from booking pickers (enforced at the picker
call sites) without touching any booking, contract, or transaction it's
already attached to.

### Delivery (`deliveries.status`)
```
draft → shared ⇄ archived
```
`shared` mints a `share_token`; files are served through short-lived signed
URLs, never a public storage path.

### Booking stages — not a fixed graph
Unlike the entities above, a booking's "state" (its stage) has **no fixed
transition graph** — a studio names and orders its own stages. What the
system enforces instead is semantic: each stage carries one of four fixed
`kind`s (`enquiry` / `booked` / `completed` / `cancelled`), and code that
needs to reason about a booking's progress checks `kind`, never a specific
stage name or a hardcoded sequence. This is deliberate — see
[02-ONTOLOGY](02-ONTOLOGY.md) on bounded configuration.

---

## Representative commands (shape, not exhaustive)

- **`createBooking`** — Bookings. Mutations: INSERT `bookings` at the
  studio's default (or first enquiry-kind) stage. Events: `booking.created`.
- **`createContractForBooking`** — Bookings, composing onto Contracts.
  Sums `booking_lines` (price × quantity), resolves a deposit percentage by
  asking Services for each line's payment policy (strictest wins), then
  asks Contracts to draft the row. Events: `contract.created`.
- **`activateContract`** — Contracts. Preconditions: status is `proposed`
  or `modified`. Mutations: UPDATE status → `active`, set `signed_at`. No
  side effects on other modules — see Principle 3.
- **`addInvoiceToBooking`** — Bookings, composing onto Finances via
  `raiseInvoiceForBooking`. Mutations: INSERT `financial_transactions` at
  `pending`. Events: `financial_transaction.created`.
- **`settleTransaction`** — Finances. Mutations: UPDATE status → `settled`,
  set `settled_at`. Events: `financial_transaction.status_updated`.
- **`updateTaskStatus`** — Production. Preconditions: new status reachable
  per the Task state machine above. Events: `task.status_updated` with
  `{ from, to }`.

---

## Tenant isolation

| Context | Client | Rule |
|---|---|---|
| Dashboard pages (RSC) | `supabaseAdmin`, scoped manually | `orgId` from `getAuthOrgId()`, every query filtered by it |
| Server actions (mutations) | `supabaseAdmin` | Same — `getAuthOrgId()` first, every write scoped |
| Public portal / booking pages | `supabaseAdmin` | No session — org resolved from the URL's `slug`, every query scoped to that resolved org id |

**Forbidden:**
```typescript
// Never — org resolved by grabbing the first row
const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
const org = orgs?.[0];
```

**Required:**
```typescript
const { orgId } = await getAuthOrgId(); // throws / redirects if unauthenticated
// every query below this line filters .eq('organization_id', orgId)
```

`getAuthOrgId()` resolves via the authenticated user's linked `contacts.auth_user_id`
first, falling back to an email match only for stale sessions — see
[03-KERNEL_SPEC](03-KERNEL_SPEC.md) on why a contact carries no role tag itself.

---

## Event schema (unchanged from the original design)

```
{
  organization_id: uuid
  entity_type:     text    -- 'booking' | 'contract' | 'client' | 'task' | etc.
  entity_id:       uuid
  action:          text    -- 'created' | 'activated' | 'status_updated' | etc.
  actor_id:        uuid?   -- the acting contact; null for system triggers
  payload:         jsonb
  created_at:      timestamptz
}
```

## Known gaps (accurate as of this revision)

| Capability | Status |
|---|---|
| Real payment processing | Explicitly deferred by product decision — manual settlement only, see memory `finances-scope-decisions` |
| Digital signature | Not built — `activateContract` is the "signing" action, no third-party integration |
| Resource/room/gear reservation | Not built — the Scheduling module was dropped from the target architecture; build only if a studio actually has colliding shooters/rooms |
| Bounded vocabulary for transaction `type` | Deferred — free text today, no cascade currently needs it to be closed |
| Automation / rules engine | Does not exist and is not planned — see Principle 3, this is a deliberate design stance, not a gap |

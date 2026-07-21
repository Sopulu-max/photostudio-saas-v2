# 09. System Contracts

This document defines the **behavioral contracts** of the Studio Operating System. It is the authoritative reference for how entities mutate, what events they emit, and what constraints the system enforces. Any code that creates, modifies, or reads kernel entities MUST conform to this document.

---

## Contract Principles

1. **Commands, not Updates.** State mutations are named commands (e.g., `ActivateAgreement`), not generic CRUD operations. Each command has a single responsibility.
2. **State Machine First.** No entity may transition to a state outside its defined graph. The system enforces this at the action layer (and ideally via DB triggers).
3. **Every Mutation Emits an Event.** Any successful state change writes a record to the `events` table. Event logging failures are hard errors, not warnings.
4. **Side Effects Are Explicit.** When a command triggers downstream creation (e.g., activating an Agreement spawns a Workflow), those downstream entities also emit their own creation events.
5. **Tenant Isolation is Mandatory.** All dashboard queries MUST use the authenticated user's `organization_id` from their JWT. `supabaseAdmin` is permitted ONLY inside server actions that also perform their own authorization check.

---

## Entity State Machines

### Intent
```
created → reviewed → accepted  (terminal: Agreement now exists)
                  → declined   (terminal)
                  → withdrawn  (terminal)
        → withdrawn
        → expired
```
Implemented in: `src/lib/actions/intents.ts` → `INTENT_TRANSITIONS`

### Agreement
```
proposed → active    (triggers: Workflow spawn, Deposit Invoice creation)
         → cancelled (terminal)
active   → modified  (version increments, terms updated)
         → completed (terminal: all deliverables delivered)
modified → active
```
Implemented in: `src/lib/actions/agreements.ts`

### Workflow
```
created     → in_progress
            → halted
in_progress → completed   (terminal: all tasks completed)
            → halted
halted      → in_progress (resumable)
```
Implemented in: `src/lib/actions/workflows.ts` → `WORKFLOW_TRANSITIONS`

### Task
```
created     → assigned
            → in_progress
assigned    → in_progress
            → blocked
            → created      (unassignment)
in_progress → blocked
            → completed    (terminal)
blocked     → in_progress
            → created
```
Implemented in: `src/lib/actions/workflows.ts` → `TASK_TRANSITIONS`

### Asset
```
registered → available
available  → in_use
           → retained
in_use     → available
           → retained
retained   → released      (terminal)
```
Implemented in: `src/lib/actions/assets.ts` → `ASSET_TRANSITIONS`

### Deliverable
```
produced  → reviewed
          → delivered
reviewed  → delivered
          → produced       (revision requested: revert)
delivered → archived       (terminal)
```
Implemented in: `src/lib/actions/assets.ts` → `DELIVERABLE_TRANSITIONS`

### Financial Transaction
```
created → pending → settled  (terminal: money received)
                  → voided   (terminal: cancelled)
```
Note: Financial Transactions are never deleted. Corrections are new transactions (e.g., a refund is a new `outbound` transaction).

### Resource
```
available → reserved → in_use → available
available → maintenance → available
any       → retired    (terminal: written off)
```

---

## Command Contracts

### `createIntent`
- **Input:** `{ organizationId, personId, source?, description?, serviceTemplateId?, metadata? }`
- **Preconditions:** Person must belong to Organization.
- **Mutations:** INSERT `intents` row at status `created`.
- **Events Emitted:** `intent.created`

### `updateIntentStatus`
- **Input:** `{ intentId, organizationId, newStatus, actorId }`
- **Preconditions:** `newStatus` must be reachable from current status per state machine.
- **Mutations:** UPDATE `intents.status`
- **Events Emitted:** `intent.status_updated` with `{ from, to }`

### `createAgreement`
- **Input:** `{ organizationId, intentId, personId, terms, actorId }`
- **Preconditions:** Intent must be in `reviewed` or `accepted` status.
- **Mutations:** INSERT `agreements` row at status `proposed`.
- **Events Emitted:** `agreement.created`

### `activateAgreement` ← THE CORE COMMAND
- **Input:** `{ agreementId, organizationId, actorId }`
- **Preconditions:** Agreement status must be `proposed` or `modified`.
- **Mutations:**
  1. UPDATE `agreements.status` → `active`, set `signed_at`
  2. INSERT `workflows` row from template
  3. INSERT `tasks` rows from workflow template stages
  4. INSERT `financial_transactions` row for deposit invoice (status: `pending`)
- **Events Emitted:**
  1. `agreement.activated`
  2. `workflow.created` (with `trigger: agreement_activation`)
  3. `task.created` (one per stage, with `trigger: workflow_spawn`)
  4. `financial_transaction.created` (with `trigger: agreement_activation`)

### `createTask` / `updateTaskStatus`
- See state machine above. Both emit events with `{ from, to }` on status changes.

### `registerAsset`
- **Input:** `{ organizationId, workflowId?, origin, type, fileReference, actorId }`
- **Mutations:** INSERT `assets` row at status `registered`.
- **Events Emitted:** `asset.registered`

### `createDeliverable`
- **Input:** `{ organizationId, assetId, agreementId, personId, actorId }`
- **Preconditions:** Asset must be in `available` status.
- **Mutations:** INSERT `deliverables` row at status `produced`.
- **Events Emitted:** `deliverable.created`

---

## Tenant Isolation Rules

| Context | Permitted Client | Rule |
|---|---|---|
| Dashboard pages (RSC) | `createClient()` from `@/lib/supabase/server` | User must be authenticated. `orgId` comes from `user.user_metadata.organization_id`. |
| Server Actions (mutations) | `supabaseAdmin` | MUST still validate `organization_id` matches authenticated user before mutating. |
| Public portal pages (`/portal`, `/storefront`, `/book`) | `supabaseAdmin` | Permitted — unauthenticated users. Queries must be scoped by `orgSlug` → `org.id` lookup. |
| Client Components | `createClient()` from `@/lib/supabase/client` | Use RLS. Never use admin key on the client. |

**Forbidden pattern:**
```typescript
// ❌ NEVER do this in dashboard pages
const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
const org = orgs?.[0]; // This will show another studio's data in production
```

**Required pattern:**
```typescript
// ✅ Always do this in dashboard pages
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
const orgId = user?.user_metadata?.organization_id;
if (!orgId) redirect('/login');
```

---

## Event Schema

Every event record conforms to:
```
{
  organization_id: uuid    -- tenant scope
  entity_type:     text    -- 'agreement' | 'workflow' | 'task' | etc.
  entity_id:       uuid    -- ID of the mutated entity
  action:          text    -- verb: 'created' | 'activated' | 'status_updated' | etc.
  actor_id:        uuid?   -- who caused this (null for system triggers)
  payload:         jsonb   -- { from?, to?, trigger?, ...context }
  created_at:      timestamptz
}
```

The `payload.trigger` field distinguishes user-initiated actions from system-triggered side effects (e.g., `trigger: 'agreement_activation'`).

---

## Not Yet Implemented (Next Pass)

The following capabilities are specified in `03-CAPABILITY_DESIGN.md` but have no implementation yet:

| Capability | Status | Target Module |
|---|---|---|
| Resource Reservation | ❌ Missing | `src/lib/actions/resources.ts` |
| Asset-Mediated Dependencies | ❌ Missing | DB trigger or `updateTaskStatus` guard |
| Digital Signature (real) | ❌ Placeholder | Integration with DocuSign or similar |
| Payment Processing | ❌ Placeholder | Stripe Webhook → `updateTransactionStatus` |
| Client Approval Portal | ❌ Missing | `/portal/[orgSlug]/review/[workflowId]` |
| Proposal via Visual Engine | ❌ Missing | Connect `visual_layouts` to portal renderer |
| Agreement Versioning | ❌ Partial | `version` integer exists; modify command needed |

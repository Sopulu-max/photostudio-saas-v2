# 03. Kernel Specification

> **Revision note:** this document previously specified ten Level-1 entities
> (Organization, Intent, Person, Resource, Workflow, Task, Asset, Deliverable,
> Agreement, Financial Transaction) as the immutable kernel. Only three of
> those survive as kernel concepts; the rest are either retired (`Intent`,
> `Workflow` as a standalone entity) or now owned by a module instead of the
> kernel (Task → Production, Financial Transaction → Finances, Deliverable →
> Delivery, Agreement → Contracts, Resource → not built). See
> [00-FRAMEWORK](00-FRAMEWORK.md) and [02-ONTOLOGY](02-ONTOLOGY.md) for why.

The kernel is deliberately small: the things a studio's data cannot exist
without, regardless of what it sells or how it runs production. Everything
else — pricing, bookings, money, work, delivery — is a module's
responsibility, not the kernel's.

## Kernel rules

1. Nothing enters the kernel unless every module needs it.
2. A kernel entity is constructible at minimum: a contact needs only an id;
   an organization needs only a name.
3. The kernel knows nothing about photography, music, or any specific
   domain — and nothing about services, bookings, or money either. Those are
   module concerns.
4. Modules compose onto the kernel by referencing a kernel id (`contact_id`,
   `organization_id`) — the kernel never references a module's tables back.

---

## Entity 1 — Organization

**What it is.** The studio itself — the tenant.
**Relationships.** Every module table is scoped to one organization via
`organization_id`, enforced by RLS and by every query.
**Lifecycle.** Created → Active. Never deleted.
**MVR.** A name.

---

## Entity 2 — Contact

**What it is.** Any human or business the studio deals with. Identity only —
name, email, phone, an optional `auth_user_id` if this contact can log into
the dashboard. The kernel does not know or care whether a contact is a
client, a team member, both, or neither.
**Relationships.** Referenced by module tables that give it a role: a
`clients` row makes it a client, an `employees` row makes it a team member.
Both can point at the same contact — composition by reference, not a type
tag on the contact itself.
**Lifecycle.** Created → progressively enriched. Never deleted outright;
modules that reference it manage their own archive/status instead (a client
can be archived, a contact is not).
**MVR.** A display name.
**Kernel law.** The kernel never gains a "kind" or "role" column on contact.
If something needs to know what a contact *is*, it asks the module that
would own that relationship, not the kernel.

---

## Entity 3 — Event

**What it is.** An append-only record of something that happened —
organizational memory.
**Relationships.** Tagged with `entity_type`/`entity_id` (what it happened
to), an `action`, and an `actor_id` (which contact did it).
**Lifecycle.** Created. Never updated, never deleted.
**MVR.** An entity type, an entity id, an action.
**Kernel law.** Events are written by modules as things happen; nothing
currently reacts to an event automatically. There is no automation/rules
engine — every cascade in the system today is either a direct function call
through a module's `interface.ts`, or a deliberate, separate action a person
takes (see [00-FRAMEWORK §1](00-FRAMEWORK.md) on composition over
orchestration).

---

## What used to be kernel, and where it actually lives now

| Old Level-1 entity | Where it lives now |
|---|---|
| Intent | Retired — a lead is a booking in an `inquiry`-kind stage, not a separate object |
| Person | Split: `Contact` (kernel, identity only) + `Clients`/`Team` modules (the roles) |
| Resource | Not built — no module currently manages gear/room booking |
| Workflow | Collapsed into `booking_lines` — a line *is* the production unit; tasks hang off it |
| Task | Owned by the **Production** module |
| Asset | Not built as a standalone concept |
| Deliverable | Owned by the **Delivery** module (`deliveries` + `delivery_files`) |
| Agreement | Renamed and owned by the **Contracts** module |
| Financial Transaction | Owned by the **Finances** module |

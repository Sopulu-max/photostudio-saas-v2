# 03. Kernel Specification

The kernel defines the Level 1 immutable primitives — the smallest set of concepts without which a production organization cannot exist. Every database table, API endpoint, and UI component must trace back to something here.

## Kernel Rules

1. Nothing enters the kernel unless production cannot happen without it.
2. Every entity must be constructible at its Minimum Viable Representation (MVR). Completeness is never required for creation.
3. Workflows describe how studios organize work. They live as configuration, not as hardcoded steps.
4. The kernel knows nothing about photography, music, film, or any specific domain.

---

## Entity 1 — Organization

**What it is.** The persistent production entity. The studio itself.
**Relationships.** Employs Persons. Owns Resources. Offers configured Services. Enters Agreements.
**Lifecycle.** Created → Active → Suspended → Archived. Never deleted.
**MVR.** A name.

---

## Entity 2 — Intent

**What it is.** The desire for something to exist that does not yet exist. The root object of every production cycle.
**Relationships.** Originates from a Person. References configured Services. May become an Agreement.
**Lifecycle.** Created → Reviewed → Accepted / Declined / Withdrawn / Expired.
**MVR.** A Person + a description of what they want.
**Kernel law.** Intent expresses desire. Only an Agreement expresses commitment. No work begins from Intent alone.

---

## Entity 3 — Person

**What it is.** Any human actor in the system. The engine does not distinguish between clients and employees at Level 1 — that is Level 2 extension.
**Relationships.** Creates Intents. Enters Agreements. Performs Tasks. Receives Deliverables.
**Lifecycle.** Created → progressively enriched → optionally Archived. Never deleted.
**MVR.** One unique identifier.
**Kernel law.** An Organization may itself be treated as a Person (for B2B relationships).

---

## Entity 4 — Resource

**What it is.** Any non-human asset required for production. Gear, space, software, vehicles.
**Relationships.** Owned by Organization. Reserved by Workflow stages. Checked out to Persons.
**Lifecycle.** Registered → Available → Reserved → In Use → Available. Never silently deleted.
**MVR.** A name + a type.

---

## Entity 5 — Workflow

**What it is.** An ordered sequence of stages that transforms Intent into a Deliverable.
**Relationships.** Instantiated from a configured template. Contains Tasks. Produces Assets.
**Lifecycle.** Created → In Progress → Completed / Halted.
**MVR.** At least one stage.
**Kernel law.** The engine defines that Workflows exist and have stages. Studios define what those stages are.

---

## Entity 6 — Task

**What it is.** A discrete unit of work within a Workflow stage.
**Relationships.** Belongs to a Workflow stage. Assigned to a Person. May consume or produce Assets.
**Lifecycle.** Created → Assigned → In Progress → Completed / Blocked.
**MVR.** A description.

---

## Entity 7 — Asset

**What it is.** Any artifact produced or consumed during production.
**Origin.** Either *Produced* (created by a Workflow) or *Provided* (supplied externally).
**Relationships.** Managed by Organization. Consumed and produced by Workflows. Carries provenance.
**Lifecycle.** Registered → Available → In Use → Retained / Released. Never silently deleted.
**MVR.** A reference pointer + its origin.
**Kernel law.** Asset provenance may cross organizational boundaries (for outsourcing/white-label).

---

## Entity 8 — Deliverable

**What it is.** An Asset that has been approved and transferred to the recipient. The value that fulfills an Agreement.
**Relationships.** Produced by a Workflow. Fulfills an Agreement. Received by a Person.
**Lifecycle.** Produced → Reviewed → Delivered → Archived.
**MVR.** A reference to its Workflow + a pointer.

---

## Entity 9 — Agreement

**What it is.** The mutual commitment between Organization and Person to deliver specific value under specific terms.
**Relationships.** Originates from Intent. Commits Organization and Person. Spawns Workflows. Generates Financial Transactions.
**Lifecycle.** Proposed → Active → Modified → Completed / Cancelled.
**MVR.** An accepted Intent.
**Kernel laws.**
- Workflows are created only by their Agreement.
- Modification never overwrites; it versions.
- Cancellation halts non-completed Workflows. The Agreement record persists.

---

## Entity 10 — Financial Transaction

**What it is.** Any movement of money — in or out.
**Relationships.** Linked to an Agreement, a Person, or an Organization.
**Lifecycle.** Created → Pending → Settled / Voided. Never deleted.
**MVR.** An amount + a direction (in/out).

---

## The Kernel Chain

```
Organization ── employs ──► Person
Organization ── owns ──► Resource
Person ── creates ──► Intent ── references ──► configured Services
Intent ── accepted ──► Agreement ◄── commits ── Organization + Person
Agreement ── spawns ──► Workflow(s)
Workflow ── assigns ──► Tasks to Persons, reserves Resources
Workflow ── produces ──► Assets ── approved as ──► Deliverables
Deliverable ── transferred to ──► Person
Agreement ── generates ──► Financial Transactions
```

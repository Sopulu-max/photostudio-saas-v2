# 02. Ontology: Kernel, Modules, Configuration

> **Revision note:** this document previously described a "Three-Level Model"
> built around a polymorphic `Person` entity (extended into Client/Employee/
> etc.), a root `Intent` object, and an `Agreement` entity. That schema was
> retired — `persons` and `intents` were dropped, `agreements` was renamed to
> `contracts`, and `workflows` collapsed into `booking_lines`. This revision
> describes the model that actually exists: see [00-FRAMEWORK](00-FRAMEWORK.md)
> for the full picture, [03-KERNEL_SPEC](03-KERNEL_SPEC.md) for the kernel in
> detail.

The system separates three things: what's universal (the kernel), what's a
self-contained capability (a module), and what a studio shapes for itself
(bounded configuration). This is composition by foreign key and interface,
not inheritance — there is no supertype that gets specialized.

## The kernel — universal, the same for every studio

| Concept | What it is |
|---|---|
| **Organization** | The studio itself. Created → active, never deleted. |
| **Contact** | Any human or business the studio deals with — identity only (name, email, phone, optional login). Not typed as "client" or "employee" at this level. |
| **Event** | An append-only record of something that happened, attributed to an actor contact. Organizational memory, not yet reactive. |

That's the whole kernel. Nothing else is universal — everything a studio
actually *does* (sell services, take bookings, manage a team, invoice, run
production, deliver files) is a module.

## Modules — self-contained, composed by reference

A contact **becomes** a client, a team member, both, or neither, by whether a
`clients` row or an `employees` row references its id — not by the kernel
tagging it with a type. This is the load-bearing difference from the old
model: **composition by foreign key, never a polymorphic supertype.** The
kernel never needs to know what a contact "is"; each module that cares
declares the relationship itself.

| Module | What it owns |
|---|---|
| **Clients** | CRM depth on a contact: notes, tags, source, active/archived status |
| **Team** | Employment on a contact: roles, staff status |
| **Services** | What the studio sells: price, currency, duration, payment policy, categories, reusable production blueprints, intake questions |
| **Bookings** | The spine: a booking, its lines (each optionally sourced from a service), its stages |
| **Contracts** | Versioned terms for a booking |
| **Finances** | Money movement: invoices, payments, refunds |
| **Production** | Work: tasks and assignments, derived from a booking line's service blueprint |
| **Delivery** | Finished-work handoff: a named file bundle with its own share link |

A module is whole on its own — it has its schema, its logic (`domain.ts`),
and its one public door (`interface.ts`). Other modules and every page reach
it only through that interface. See [00-FRAMEWORK §4](00-FRAMEWORK.md) for
the seam discipline and how modules compose onto a booking.

## Bounded configuration — what a studio actually shapes

Studios don't get a schema editor or a blank canvas. Every place they need to
shape something, the shape is a **closed, named vocabulary** — a fixed set of
options they can name and arrange, sometimes carrying a fixed semantic
meaning the system reasons about, sometimes not:

- **Booking stages** — studio-named, studio-coloured (from 8 fixed
  swatches), each also carrying one of 4 fixed `kind`s (enquiry / booked /
  completed / cancelled) that the system actually reasons about.
- **Intake question types** — one of 8 fixed field types per question
  (text, number, date, choice, …), not a free-form form builder.
- **Service categories** — pure studio vocabulary; unlike stage `kind`,
  nothing in the system reads meaning into a category name.
- **Payment policy** — deposit-with-a-percentage, or full-payment-required.
- **Currency, deposit defaults, blueprints** — studio-wide settings that
  seed new services, always editable per-service afterward.

The principle: **the vocabulary is the studio's; the set of possible shapes
is the engine's.** A studio can rename, recolour, and rearrange freely, but
never invent a structure the system doesn't already know how to reason
about. This is deliberately narrower than a generic no-code builder — see
[00-FRAMEWORK §1](00-FRAMEWORK.md) for why that trade was made.

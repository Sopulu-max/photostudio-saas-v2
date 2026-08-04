# 00. The Framework — "Odoo, but for studios"

> This is the canonical architecture document. The model is detailed in
> [02-ONTOLOGY](02-ONTOLOGY.md) and [03-KERNEL_SPEC](03-KERNEL_SPEC.md); the
> design system in [08-DESIGN_SYSTEM](08-DESIGN_SYSTEM.md). The product vision
> in plain language is [/docs/VISION.md](../VISION.md).
>
> **Revision history:** this document originally specified a generic no-code
> framework — a universal view-rendering engine (`view_defs`), a runtime
> model/field registry (`model_defs`/`field_defs`), and a drag-and-drop Builder
> as "the keystone" layer that painted every screen, including the app's own
> dashboard. That Builder was built, used, and **removed** — it felt like a
> dataview, not a studio's own tool, and it was pulling every module toward
> generic-canvas complexity instead of a studio's actual work. This revision
> replaces that framework with the one actually built since: a **modular
> monolith**. Odoo remains the inspiration — not a target to literally
> reproduce, but a reference for what "reach + buildability" looks like at the
> module level. See [[modular-architecture]] and [[project-vision]] in memory
> for the full decision trail.

## 0. What this actually is

One Postgres database (via Supabase), one Next.js app. A small **kernel**
holds the handful of things every studio needs regardless of what it sells
(who it is, who it talks to, what happened). Everything else is a
**module** — a self-contained capability (Bookings, Services, Clients, Team,
Contracts, Finances, Production, Delivery) that owns its own tables, its own
logic, and its own pages, and exposes exactly one door to the rest of the
system: `interface.ts`. Nothing outside a module ever touches its tables or
its `domain.ts` directly — not another module, not a page, not a view.

This is the literal architectural lesson taken from Odoo: not the Builder,
not a generic renderer, but **apps as self-contained packages on one shared
data core**, each whole and integrated, built one at a time. "Capability, not
features" means a studio can go deep into any one module (define its own
intake questions, its own booking stages, its own service categories) without
that depth leaking into — or being blocked by — any other module.

## 1. The governing law — as deep as deep goes, as usable as it goes deeply

This did not change with the framework rewrite, and it is still the thing
every build is judged against:

**A capability that is not usable does not count as built.** "The table
exists" or "the function works" is never "done." **Done = a real studio
owner used it and it felt like theirs.**

What changed is *how* that usability is achieved. The old framework's answer
was one universal visual surface — go as deep as you want, you never leave
the canvas. That promise required the Builder, and the Builder is gone. The
actual, working answer, proven repeatedly across Bookings/Services/Finances/
Clients this session, is:

**Bounded configurability.** Wherever a studio needs to shape something, give
a *closed, named vocabulary* — never a blank canvas, never raw schema access.
Concretely, every depth pass this session has landed on the same shape:

- **Booking stages** — a studio names its own stages and picks from 8 fixed
  colours, but each stage also carries one of 4 fixed semantic `kind`s
  (enquiry / booked / completed / cancelled) that the system actually
  reasons about. The name is the studio's; the kind is the engine's.
- **Intake question types** — 8 fixed field types (text, choice, date, …) in
  a registry (`src/modules/services/fieldTypes.ts`), each responsible for its
  own capture/validate/store/display — not a free-form form builder.
  Adding a 9th type is one bounded file, not a new subsystem.
- **Service categories** — pure studio vocabulary, no semantic meaning the
  system reasons about — deliberately the *other* end of the same spectrum
  (compare: stage `kind`), proving the pattern flexes for both cases.
- **Payment policy** — `deposit` or `full`, not a free-form rules engine.

A studio gets real configurability without ever seeing a schema editor, and
the engine never has to reason about arbitrary studio-invented structure.
This is the replacement for "one usable surface all the way down" — depth
lives in a small number of closed choices per module, not in a canvas.

## 2. The layers, as they actually exist

| # | Layer | What it is | Where |
|---|---|---|---|
| 1 | **Kernel** | The handful of things every studio needs regardless of what it sells: `organizations`, `contacts` (thin shared identity — no polymorphism), `events` (append-only audit log) | `src/kernel/` |
| 2 | **Modules** | Self-contained capabilities: data + logic + surface, one public door | `src/modules/<name>/{domain.ts, interface.ts}` + `src/app/(dashboard)/<name>/` |
| 3 | **Views** | Read-only lenses over other modules' data, reached only through their interfaces. Own no data, no logic. | Command Center, Calendar, My Tasks, Analytics |
| 4 | **Design system (Lumen)** | The one visual/motion language every surface is built from — see [08-DESIGN_SYSTEM](08-DESIGN_SYSTEM.md) | `.q-` classes in `globals.css` |
| 5 | **Access & Identity** | Every row scoped by `organization_id`, enforced by RLS; every tenant-facing page force-dynamic so nothing caches across tenants | RLS policies + `getAuthOrgId()` |

Layer 2 is where the actual product lives, and it is the layer this doc spends
the most words on because it is the one that keeps growing.

## 3. The kernel (Layer 1)

Deliberately small. Full detail in [03-KERNEL_SPEC](03-KERNEL_SPEC.md); in
short:

- **`organizations`** — the studio itself. Created → active, never deleted.
- **`contacts`** — any human or business the studio deals with. Identity
  only (name, email, phone, optional `auth_user_id` for dashboard login) —
  *not* a polymorphic "Person" that gets typed into Client/Employee/etc. A
  contact becomes a client by a `clients` row referencing it, a team member
  by an `employees` row referencing it. **Composition by foreign key, not
  inheritance** — the same contact can be a client, a team member, or both,
  without the kernel needing to know which.
- **`events`** — append-only log of everything that happened, keyed by
  `entity_type`/`entity_id`/`action`, attributed to an actor `contact_id`.
  Nothing reacts to events automatically yet (no automation engine) — they
  are organizational memory, read by Analytics.

## 4. Modules (Layer 2)

Each module is `src/modules/<name>/domain.ts` (the actual logic, private) +
`interface.ts` (the only public door — everything outside the module,
including other modules, imports only from here) + its own pages under
`src/app/(dashboard)/<name>/`.

| Module | Owns | Composes onto |
|---|---|---|
| **Clients** | `clients` (CRM depth: notes, tags, source, status) | a `contacts` row |
| **Team** | `employees`, `roles`, `employee_roles` | a `contacts` row |
| **Services** | `services`, `blueprints`, `service_categories`, `service_extras` — what the studio sells, its pricing/duration/payment policy, its intake questions, its reusable production stage-sets | referenced by Bookings |
| **Bookings** | `bookings`, `booking_lines`, `booking_stages` — the spine. A booking composes services (via Services), a client (via Clients), work (via Production), money (via Finances/Contracts) | asks every other module through its interface |
| **Contracts** | `contracts` — versioned terms for a booking | drafted by Bookings |
| **Finances** | `financial_transactions` — invoices and payments | raised by Bookings |
| **Production** | `tasks`, `assignments` — work items derived from a booking line's service blueprint | started by Bookings |
| **Delivery** | `deliveries`, `delivery_files` — finished-work handoff with a signed-URL share link | attached to a booking |

**Seam discipline (enforced, not aspirational):** a full sweep of the
codebase found **zero** cross-module imports of any `domain.ts` — every
module-to-module interaction goes through `interface.ts`. Where a page reads
across modules for display (e.g. the booking hub showing contract + money +
production status together), that's page-level composition, not a module
violation — the module boundary is about who *owns and mutates* data, not who
may read it for a screen.

A module that needs another module's logic **before** that module has been
built yet does not reach around it — it waits, or the dependency gets built
first. `Bookings` was built holding a stub until `Contracts`/`Finances`/
`Production` existed as real modules with real interfaces.

## 5. Views (Layer 3)

A **view** owns nothing — it's a lens over data that already exists,
assembled by calling multiple modules' interfaces. Command Center, Calendar,
My Tasks, and Analytics are all views: delete any one of them and no data is
lost, only a way of looking at it.

## 6. Design system (Layer 4)

See [08-DESIGN_SYSTEM](08-DESIGN_SYSTEM.md) in full. In short: warm
gallery-paper neutrals, ultramarine accent, one motion language, everything
through `.q-` utility classes so a visual fix happens in one place. Both light
and dark theme ship, as two complete token sets switched by a `data-theme`
attribute.

## 7. Access & Identity (Layer 5)

- Every table scoped by `organization_id`; every query filters on it —
  `getAuthOrgId()` resolves the acting org/contact, never a blind
  `.limit(1)` guess.
- Every dashboard and portal page declares `export const dynamic =
  'force-dynamic'` so Next.js never caches one tenant's data for another's
  request.
- RLS policies exist as the backstop behind manual scoping on every table.

## 8. Worked example — how a booking actually gets built and paid

No builder, no `view_def` — just modules composing through interfaces:

1. **Services** defines what's sold: price, duration, payment policy
   (deposit % or full), a reusable production blueprint, intake questions.
2. A client books (publicly, or an operator creates the booking). **Bookings**
   asks **Clients** for-or-creates the contact, asks **Services** for the
   service's price/duration/questions to build a line, and lands the booking
   on the studio's own first enquiry-kind stage.
3. The operator asks **Bookings** to draft a contract. Bookings sums the
   line totals itself (it owns `booking_lines`) and asks **Services**, via
   its interface, for each line's payment policy — resolving one deposit
   percentage for the whole booking — then asks **Contracts** to draft the
   terms. Contracts never reads a booking line; Bookings never writes a
   contract row.
4. Activating the contract is a deliberate, separate click — nothing
   auto-spawns. The operator then asks Bookings to raise an invoice (Bookings
   asks **Finances**), or starts work on a line (Bookings asks
   **Production**, which reads the line's service blueprint via **Services**
   to seed tasks).
5. **Analytics** and **Calendar** later read all of this back — through the
   same interfaces, never the raw tables — to render as a view.

Every arrow above is a real function call through a real `interface.ts`. This
*is* the framework — there is no layer underneath it that's more "real."

## 9. How modules actually get built (the proven rhythm)

Not a phased roadmap — a repeating cycle, run once per module, that has now
been proven across Bookings, Services, Finances, and Clients:

1. **Audit.** Read the module's current `domain.ts`, its pages, and what
   calls its `interface.ts`. Extract concretely what's missing, hardcoded,
   or write-once — not a guess, a traced list.
2. **Design the configurability boundary.** For anything a studio needs to
   shape, decide: closed vocabulary (bounded, Section 1) or hardcoded
   engine behaviour? Never a free-form canvas.
3. **Build the whole vertical slice.** Schema → `domain.ts` → `interface.ts`
   → UI, wired into navigation, in one pass. No backend without a UI, no UI
   without real data behind it, per the Vertical Slice rule.
4. **Trace the cascade.** Before calling it done, check what this touches
   system-wide — other modules' pickers, totals, suggestions. (This
   caught real bugs: an archived-client picker that didn't filter, a
   contract that hardcoded 0% deposit, a currency that silently defaulted
   to USD.)
5. **Verify for real** — type-check, then click through the actual UI with
   real data, not just trust the types.

**Status by module** (depth pass done this session vs. still thin):
Bookings, Services, Finances, Clients — audited and deepened. Team,
Contracts, Production — still close to their original modular-rebuild
shape, not yet given the same treatment.

## 10. Honest scope

This is real, ongoing, incremental work — one module at a time, each shipped
whole rather than the whole app rebuilt at once. The kernel and seam
discipline are the part that doesn't change; the modules are the part that
keeps growing. No big-bang rewrite, no generic engine underneath waiting to
be finished — what you see in a module's `domain.ts`/`interface.ts`/pages is
the whole of what that module is.

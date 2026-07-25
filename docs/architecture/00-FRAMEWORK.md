# 00. The Framework — "Odoo, but for studios"

> This is the canonical architecture document. It supersedes the **framing** of
> the older docs (the "Studio OS / kernel" language). Their *content* is still
> true and is folded in as chapters of this framework:
> the model is detailed in [02-ONTOLOGY](02-ONTOLOGY.md) and
> [03-KERNEL_SPEC](03-KERNEL_SPEC.md); the view engine in
> [05-UBIQUITOUS_VISUAL_ENGINE](05-UBIQUITOUS_VISUAL_ENGINE.md); the design
> system in [08-DESIGN_SYSTEM](08-DESIGN_SYSTEM.md). The product vision in plain
> language is [/docs/VISION.md](../VISION.md).

## 0. The correction that reframes everything

We are not building a *set of studio apps*. We are building the **framework those
apps are made of** — and then the apps are thin things that sit on top of it.

That is the whole lesson of Odoo. Odoo's depth is not its 40+ apps; it is the
framework underneath them: a model layer where entities and fields are data, a
module system, a view layer where screens are declared as data and painted by one
generic engine, an automation engine, and an access layer. The apps are mostly
*configuration* expressed in that framework.

So a **surface lookalike** copies Odoo's apps. A **structural lookalike** — what
we are building — copies Odoo's *framework*, then expresses studio apps in it.

**The load-bearing consequence:** if screens are declared as data and rendered by
one engine, then the app's own management screens and the studio's self-built
pages are *the same system*. "Capability, not features" stops being a feature we
add and becomes the substrate everything is made of.

But that is only *half* the target. The other half is Section 1, and it is not
optional.

---

## 1. The governing law — as deep as deep goes, as usable as it goes deeply

There is a graveyard full of frameworks that are **mathematically accurate and
unusable** — perfectly expressive, internally elegant, and wieldable by no real
human. **Odoo itself lives on the edge of that grave:** it has the depth, and it
is famously heavy. Power users tolerate it; everyone else drowns.

Our target is Odoo's depth **without** Odoo's clumsiness. So this document holds
two commitments as **co-equal and non-negotiable:**

- **Depth:** as deep as depth goes — including a studio reshaping the data model
  itself, and eventually the framework describing itself (self-hosting).
- **Usability:** as usable as it goes deeply — every level of that depth has a
  surface a real studio owner can actually use.

**The law:** *a capability that is not usable does not count as built.*
"Structurally complete" is never "done." **Done = a real studio owner used it and
it felt like theirs.** Usability is not stacked on top of the five layers below —
it **constrains every one of them.**

Five mechanisms make deep power stay usable. They are requirements, not nice-to-haves:

1. **Works out of the box.** A studio has a functioning studio on day one without
   touching any depth. Power is opt-in and quiet, never in your face. (The
   "Goldilocks / First App" idea from [/docs/VISION.md](../VISION.md).)
2. **Progressive disclosure.** You meet only the complexity you ask for. Simple
   task → simple surface; the deep machinery is present but silent. (Generalizes
   "progressive definition": you never predefine the world before living in it.)
3. **One usable surface all the way down** — the anti-Odoo move, and the hardest
   promise. Going deeper must **never** drop you out of the visual builder into
   raw config screens or code. The same building experience that arranges a page
   is how you eventually reshape a model. No cliff.
4. **Constrained freedom.** Usability comes from good rails, not infinite options.
   The design system ([08](08-DESIGN_SYSTEM.md)) makes whatever a studio builds
   look premium *by default* — you'd have to work to make it ugly. (Framer's and
   Squarespace's real trick.)
5. **Usability is the proof.** Every build phase is validated by "you used it and
   it felt like yours," never by "it is technically expressive." This rewrites the
   build order (Section 9).

If a layer below gains depth but no usable surface, it is **not finished** — it is
a liability that pushes us toward the grave above.

---

## 2. The layers

Every part of the system is one of five layers. Build these deep — and give each
one a **usable surface** (Section 1), or it does not count as built.

| # | Layer | One line | Its usable surface (non-optional) | Seed in current code |
|---|---|---|---|---|
| 1 | **Model & Metadata** | Entities and fields, as data | Studios add fields / reshape models *in the visual builder*, never SQL | `migrations`, `types/engine.ts` |
| 2 | **Module System** | Apps as packages that plug in | Turn apps on/off from the launcher; install is a click, not a deploy | folder-per-domain in `src/lib/actions` |
| 3 | **View & Render Engine** *(keystone)* | Screens declared as data, one engine paints them | **The builder itself** — the primary surface a studio touches | `VisualEngine/Renderer.tsx`, `visual_layouts`, Builder |
| 4 | **Automation & Events** | When X happens, do Y | Rules read as plain "when … then …" sentences, not code | state machines + `events` + `logEvent` |
| 5 | **Access & Identity** | Who may see and do what | Roles & permissions set visually, with safe defaults | RLS + `organization_id` + person roles |

The rest of this doc specifies each layer (with its usable surface), walks one real
module through all of them, then gives the usability-first build order.

---

## 3. Layer 1 — Model & Metadata

### 3.1 Base models (unchanged)
The ten kernel entities in [03-KERNEL_SPEC](03-KERNEL_SPEC.md) — Organization,
Intent, Person, Resource, Workflow, Task, Asset, Deliverable, Agreement,
Financial Transaction — are the **base models**. They keep real Postgres tables
(integrity, performance, relations). Their lifecycles (state machines) and MVR
(minimum viable representation — creatable with almost nothing) stand.

### 3.2 The metadata registry (full depth)
Models and fields are themselves **data**, so the system extends without a code
deploy — the way Odoo uses `ir.model` / `ir.model.fields`:

```
model_defs   (id, org_id, name, label, kind)          kind: base | extension | custom
field_defs   (id, model_def_id, name, label, type,    type: text|number|bool|date|
              relation_model, required, config jsonb)         select|relation|media|money
```

- **Base**: the 10 kernel models (registered, not editable).
- **Extension**: a studio adds fields to a base model (e.g. `shoot_location` on
  Service) — stored in a JSONB `attributes` column on the base table.
- **Custom**: a studio defines a brand-new entity type (Level 3) — stored in a
  generic `records(model_def_id, org_id, data jsonb)` table.

This hybrid (real tables for the 10 base models + registry + JSONB for
studio-defined fields/entities) is fast and safe for the core and fully extensible
at the edge. It makes Levels 2–3 of [02-ONTOLOGY](02-ONTOLOGY.md) *real at runtime*.

**Usable surface (required):** a studio never writes SQL or edits a schema. Adding
a field or a new entity type happens in the same visual builder as everything
else — "add a field" is a button, its type a dropdown, and it appears on the
record's form immediately. Depth here is only real if this surface exists.

---

## 4. Layer 2 — Module System

A **module** is a package that declares everything it adds:

```
manifest = {
  name, label, icon, category, depends: [...otherModules],
  models:      [ model_def, ...],      // new models / extensions
  views:       [ view_def, ...],       // screens (Layer 3)
  automations: [ automation, ...],     // rules (Layer 4)
  permissions: [ permission, ...],     // access (Layer 5)
  seed:        [ ...default records ],
}
```

Installing a module = registering its models/fields/views/automations/permissions
per organization. A `modules(org_id, name, status)` table tracks what's on.
Manifests start in code (`src/modules/<name>/manifest.ts`); later they can be
authored as data.

**Usable surface (required):** installing an app is a click in the launcher and it
just appears — its tile, its menus, its default screens — working, with sensible
seed data. Uninstalling is safe and reversible. No configuration marathon before
first value.

---

## 5. Layer 3 — The View & Render Engine  *(the keystone)*

The most important layer. Build it deepest, and make it the most usable — it is
the surface a studio actually lives in.

### 5.1 A view is data
A screen is a **view definition**: a tree of blocks bound to a model, of a kind.

```
view_defs (id, org_id, model_def_id, kind, name, definition jsonb, status)
          kind: form | list | kanban | page | public
          definition = a tree of VisualNode  (the existing block type)
```

`VisualNode` already exists in `Renderer.tsx`: `{ id, type, props, children, bind }`.
We extend the block set (Section, Gallery, Video, Price, Repeater/Collection,
BookButton, Field-input, …); the shape holds.

### 5.2 One engine paints them all
A single **runtime**: load a `view_def` → fetch bound record(s) as `dataContext`
→ render via the (extended) `Renderer` → wire actions.

- **Binding** (read): a block's `bind` is a dot-path into the data
  (`service.pricing.base_price`). Implemented; we add a UI to set it.
- **Actions** (write): a block declares a named action (`book`, `save`,
  `transition:accept`) into Layer 4. Replaces the current hardcoded `formAction`.
- **Collections**: a Repeater binds to a *list* and renders its child tree per
  row — how "team page from employee data" and galleries work.

### 5.3 The builder edits view defs; nothing is hardcoded
The Builder is the **universal editor for view_defs**. Storefront, service page,
invoice, client gallery — and eventually management list and form screens — are
all `view_defs` rendered by one engine. The studio edits the editable ones; the
app ships default view_defs for the rest.

**Usable surface (required):** the studio never sees the word "view_def" or a tree
of JSON. They see a canvas, drag premium blocks, click to bind a block to their
real data ("this price = the service's price"), and it looks good by default
(Layer 1's constrained-freedom rule). Binding and actions — the deep parts — are
expressed as plain choices, not expressions or code. This surface *is* the
product's feeling; if it isn't a joy to use, the framework has failed its law.

---

## 6. Layer 4 — Automation & Events

### 6.1 State machines (declared, not scattered)
Each model's legal transitions (from [03-KERNEL_SPEC](03-KERNEL_SPEC.md)) are
declared once and enforced centrally, not re-implemented per action.

### 6.2 The event bus + rules (the missing nervous system)
The `events` table already records everything (append-only memory). Today nothing
*reacts* — reactions are hardcoded inside actions (`activateAgreement` inlines
"spawn workflow + deposit invoice"). We make reactions **data**:

```
automations (id, org_id, trigger_model, trigger_event, condition jsonb, action)
```

An executor runs after each event, matches rules, runs actions. The spawn we
recently single-sourced becomes the first rule: *on Agreement→active → run
`spawn_workflow` + `raise_deposit`.*

**Usable surface (required):** a studio builds a rule as a readable sentence —
*"When a booking is paid, send the client a thank-you and start the shoot
checklist"* — chosen from menus, never written as code. The powerful cases stay
reachable by widening the same sentence, not by dropping into a scripting console.

---

## 7. Layer 5 — Access & Identity

- **Tenant isolation**: every row scoped by `organization_id`, enforced by RLS.
  (Exists — the Multi-Tenant Mandate.)
- **Roles & permissions**: `permission_defs` per module + role → read/write per model.
- **Record rules**: data-level visibility (a client sees only their own
  agreements) as conditions, applied by the data layer and RLS.

**Usable surface (required):** roles come with safe defaults out of the box; a
studio adjusts "who can see/do what" from a simple visual screen, never by writing
policies. The safe path is the default path.

---

## 8. Worked example — Service Pages through all layers

The first module. It exists *only* to force the framework — and its usability —
into being.

1. **Model** — a Service (`service_template`) gains a public **page** view_def
   (kind `public`), plus media/gallery fields via the registry (`attributes`).
2. **Module** — a `service-pages` manifest declares that view, a default page
   layout (seed), the book action, and its menu tile.
3. **View engine** — the studio opens the Builder on the service's public
   view_def; it renders with the *real service* as data context; they drop
   Image/Gallery/Text/Price(bind `service.pricing.base_price`)/BookButton blocks.
   They never see a `view_def` — they see a canvas and their real service filling it.
4. **Automation** — the BookButton's `book` action emits an event; the `autoBook`
   rule creates Person → Intent → Agreement → deposit.
5. **Access** — the page is public only when `status = published`; RLS keeps
   drafts and other orgs out.

Result: a designed, shareable, bookable service page — built from model + view +
automation, **with no hardcoded page**, by a studio owner who **enjoyed building
it.** When both of those are true at once, the framework and its law exist.

---

## 9. Build order — usability-first, proven continuously

The rule that prevents fog **and** the grave: never build a layer in the abstract,
and **prove every phase with a real person using it — not with technical
completeness.**

- **Phase 0 — View-engine core.** Generalize `visual_layouts` → `view_defs`. Fix
  the Builder's save (it currently uses the admin key in the browser — a bug). Add
  nesting/reorder, the missing blocks, premium defaults, and the binding/action UI.
  **Proof (usability, not plumbing):** *you* open the builder, drag blocks, bind
  one to real data, publish, and it looks good and feels like yours.
- **Phase 1 — Service Pages module** on that engine (Section 8). **Proof:** you
  build a real, premium, bookable service page you'd actually send a client — and
  a client books through it.
- **Phase 2 — Model/metadata registry + module manifest.** Formalize Phases 0–1.
  **Proof:** you add a custom field to a Service from the builder (no deploy) and
  it appears on the page and the form.
- **Phase 3 — Automation engine.** Move the hardcoded activation spawn into a rule.
  **Proof:** you read/adjust that rule as a plain sentence, and activation still works.
- **Phase 4 — Management UI as view_defs.** Replace one dashboard list + form with
  engine-rendered views. **Proof:** the inside of the app is now built — and
  editable — with the same builder as the outside, and feels no worse to use.
- **Phase 5+ — Modules roll out cheaply.** Portfolio, Scheduling, richer
  Storefront — the same move, mostly configuration, each shipped only when it's
  usable.

**Definition of done, every phase:** a real studio owner used the new surface and
it felt like theirs. Anything less is not done — it is depth without usability,
which this document forbids. The current app keeps running throughout; the engine
grows underneath and absorbs it screen by screen. **No big-bang rewrite.**

---

## 10. What the current code becomes

| Current | Framework role | Fate |
|---|---|---|
| `VisualEngine/Renderer.tsx` | View-engine core | **Keep, extend** |
| `visual_layouts` table + Builder | `view_defs` + universal editor | **Evolve** |
| Hardcoded `(dashboard)` pages | Default `view_defs` | **Replace over time** |
| State machines + `events` + inline spawns | Automation engine | **Refactor into rules** |
| RLS + org scoping + person roles | Access layer | **Keep, formalize** |
| `migrations` + `types/engine.ts` | Base models + metadata registry | **Extend** |
| `book/`, `storefront/` flows | Service-Pages + Storefront modules | **Absorb into modules** |

---

## 11. Honest scope

This is a **framework, not a feature** — months of work, at full depth. But it is
not a leap of faith and it will not become the unusable machine you fear: every
phase ships a usable slice validated by a real person, the existing product stays
live, and both commitments — depth *and* usability — are proven continuously.
That is how Odoo's depth gets built without Odoo's clumsiness, and without
repeating the "I don't know what we're building" fog.

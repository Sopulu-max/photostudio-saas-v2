# Reconciliation — New Framework × Old Docs × Current Code

*Purpose: line up the new framework ([00-FRAMEWORK](00-FRAMEWORK.md)) against the
old architecture docs and against what is actually built, so we can see the whole
board and decide **what, where, and how** to go — not step blindly.*

---

## 1. The headline

**The old framework and the new framework are the same vision at two
resolutions.** The new one does not replace the old — it *completes* it. The old
docs already contain Data Singularity (one core), the Ubiquitous Visual Engine,
the 10-entity kernel, the 3-level ontology, and the operations/state-machine
contracts. The new framework keeps all of that and adds the three pieces the old
one *named but never built* — a **module system**, a **metadata registry**, and
**automation-as-data** — plus the one it never had at all: the **usability law**.

And the code tells a consistent story: **it is strong exactly where the old
framework was strong (model, rules, access) and nearly empty exactly where both
frameworks and your vision point hardest (the view engine, modules).** So the path
is not mysterious — it is the least-built, highest-leverage layer.

---

## 2. Old framing → new framework (how they mix)

| Old concept (doc) | New-framework home | Built? |
|---|---|---|
| Data Singularity — one source of truth (01) | Layer 1 · shared data core | ✅ built |
| 3-level ontology: immutable / extensible / config (02) | Layer 1 · base / extension / custom models | ⚠️ base built; **extension & custom not** (no registry) |
| The 10 kernel entities + lifecycles + MVR (03) | Layer 1 · base models | ✅ built |
| Two-layer stack: Engine + Visual Engine (04) | Layers 1 + 3 | ⚠️ partial |
| Ubiquitous Visual Engine (01 pillar 2, 05) | Layer 3 · view & render engine *(keystone)* | 🌱 **seed only** |
| Operations, commands, state machines (06, 09) | Layer 4 · automation & events | ✅ built — but **hardcoded, not data** |
| Tenant isolation, event schema (09) | Layer 5 · access & identity | ✅ built |
| Quantum Elevation design system (08) | usability law · "constrained freedom" | ✅ exists as CSS |
| — *(no old equivalent)* | **Layer 2 · Module System** | ❌ new, not built |
| — *(no old equivalent)* | **Metadata registry** (Layer 1 depth) | ❌ new, not built |
| — *(no old equivalent)* | **The usability law** | ❌ new, not built — *the July gap* |
| "Operating System" metaphor | — | 🗑️ retired (see [VISION](../VISION.md)) |

**Read this column of dots and the whole strategy falls out:** everything green is
the model / rules / access spine — done. Everything seed/new/empty is the **view
engine, modules, metadata, and usability** — the frontier.

---

## 3. Layer-by-layer: what the docs promise vs what the code is

| Layer | Old docs promise | Code reality | Verdict |
|---|---|---|---|
| **1 · Model & Metadata** | 10 entities + Level 2/3 extensibility (02, 03) | 10 real tables + `types/engine.ts`; **no `model_defs`/`field_defs`**, everything hardcoded | Base **solid**; registry to **build** |
| **2 · Modules** | *(not conceived)* | domain folders in `src/lib/actions`, but no manifest/install/registry | **Build** |
| **3 · View & Render** | "No hardcoded pages… data-bound blocks everywhere" (04, 05) | **~95% hardcoded pages**; `Renderer` + `visual_layouts` + Builder used for the storefront only | **Biggest gap.** Grow the seed |
| **4 · Automation & Events** | commands, state machines, mandatory events (06, 09) | all present and largely conformant; reactions **hardcoded** in actions | **Keep**, then make rules data |
| **5 · Access & Identity** | tenant isolation, RLS, event schema (09) | RLS + org scoping + roles, working | **Keep**, formalize permissions |
| **Usability** | *(absent)* | builder is developer-grade (debug canvas, dot-path binding) | **Build** — the co-equal law |

---

## 4. Everything we've built, placed on the framework

| Asset (code) | Layer | State |
|---|---|---|
| 10 entity tables + migrations + `types/engine.ts` | 1 | ✅ solid |
| `actions/{intents,agreements,workflows,assets,persons,finances,payments,communications,events,resources,services,organizations}` | 4 | ✅ solid (single-sourced) |
| State-machine maps (`*_TRANSITIONS`) + `logEvent` + `events` | 4 | ✅ solid |
| RLS + `getAuthOrgId` + person roles | 5 | ✅ solid |
| `VisualEngine/Renderer.tsx` (data-bound node tree) | 3 | ✅ **the seed to grow** |
| `visual_layouts` table + Builder + BuilderCanvas + Sidebar | 3 | 🌱 rough MVP (just made save safe) |
| `storefront/[orgSlug]` (layout → Renderer → intent) | 3 | 🌱 works, one context |
| `book/[serviceId]` + `autoBookService` | 4/exp | ✅ works (booking) |
| ~29 hardcoded `(dashboard)` pages + portal pages | 3 | ⏳ default view_defs eventually |
| `components/visual-engine/` (Canvas, Overlay) | 3 | ❓ likely dead duplicate of `VisualEngine/` |

---

## 5. The mismatches to resolve (where old, new, and code pull apart)

1. **THE gap:** both frameworks say "ubiquitous view engine / no hardcoded pages,"
   but the code is almost entirely hardcoded pages with a storefront-only seed.
   → the work *is* Layer 3.
2. **Ontology promises extensibility the code can't deliver** — Level 2/3 are real
   in the docs, imaginary in the code (no metadata registry).
3. **Automation is hardcoded, not data** — `activateAgreement`'s spawn is the model
   case (09 even documents it as THE core command); Layer 4 wants it as a rule.
4. **`visual_layouts` is per-context-single; a view engine needs per-subject** —
   the concrete first extension (add a subject reference) → toward `view_defs`.
5. **Doc drift in 09** — it says `orgId` from `user_metadata`; the code moved to
   `getAuthOrgId` (with fallbacks). 09 should be updated.
6. **The Service model lacks media/description** — the raw material for a service
   *page* isn't on the service yet (blocks Milestone 1's "build from your data").
7. **The builder fails the usability law** — debug canvas, dot-path binding, no
   design controls; it's a developer tool, not a studio-owner's.
8. **09's "Not Yet Implemented" list still stands** — real payments (Stripe),
   digital signature, resource reservation, asset-mediated dependencies, client
   approval portal, agreement versioning, **proposal-via-visual-engine.** These are
   future *modules*, and they confirm the module system is the right container.

---

## 6. So — what, where, how

**What.** The spine (Layers 1-base, 4, 5) is built and sound; the old kernel/
contracts work paid off and we keep it. The frontier is **Layer 3 (the view
engine) and its usability** — the least-built, highest-leverage, most
vision-critical layer — pulling in **Layer 2 (modules)** and the **Layer 1
metadata registry** as it demands them, not before.

**Where.** Start exactly where a real seed already exists and both frameworks
point: `Renderer` + `visual_layouts` + the Builder. Grow the seed; don't restart.

**How.** Prove it with **Milestone 1 — "my first sellable page"** (a studio
designs a service page from its real data, it looks premium, publishes, a client
books). Every step *extends existing structure* (the fit is already mapped:
add a subject to `visual_layouts`; add media/description to the Service; reuse the
Renderer, the storefront pattern, and the booking flow), stays schema-first, and
is judged done only when it's usable.

The board is now visible. The first move is unchanged but no longer blind: it sits
on the least-built, highest-leverage layer, and it is an extension, not a bolt-on.

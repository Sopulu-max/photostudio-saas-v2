# 13. Foundations: the prior art a service rests on

This document exists because doc 02 asserts what a service is, and an assertion
is not a foundation. It records the attempts made before ours — in applied
ontology, in telecoms data modelling, in library science, in software product
lines, in service design, in services marketing, and in the photography trade
itself — and, for each, two columns: **what it names that we already have**, and
**what it names that we cannot say**.

It changes no ruling. Its purpose is to make every later ruling answerable to
something outside our own reasoning.

---

## 0. How far to trust each source

Research is only a foundation if its own weight is stated.

| Source | What was read | Standing |
|---|---|---|
| UFO-S (Nardi et al., 2015) | the paper in full, 35 pages | **primary** |
| TM Forum SID (GB922) | secondary — vendor and community pages | **secondary**; GB922 itself not opened |
| Ranganathan, Colon Classification (1933) | ISKO encyclopedia entry | **near-primary**, scholarly |
| FODA (Kang et al., 1990, CMU/SEI-90-TR-021) | secondary — later formalisation papers | **secondary** |
| Shostack, *Designing Services That Deliver* (HBR, 1984) | secondary — encyclopedic summary | **secondary**; HBR text not opened |
| Lovelock, *Classifying Services…* (J. Marketing, 1983) | secondary — teaching material | **secondary**; axes paraphrased |
| photography commercial practice | trade press, RFPs, price sheets | **secondary**, partly anecdotal |

Nothing below rests on a single secondary source alone where it drives a
conclusion; where it does, it is marked.

---

## 1. UFO-S — a service is a commitment, not an activity

The only one of these sources that attempts a *formal ontology* of service.
Its central move is that a service is not the work. A service is a **commitment**
a provider makes to a **target customer community**, described by a normative
description; the work is an *event* that discharges it.

**What it names that we have.** Our `services` row is, in its terms, a normative
description — it describes a kind of transformation the studio is prepared to
perform, and no particular performance of it. Our `packages` are the offerings
made from it; our `bookings` are the agreements; our `booking_tasks` are the
events. The layering is already right.

**What it names that we cannot say.**

- **The target customer community.** Every commitment in UFO-S is made *to
  someone*. Our offerings are made to no one in particular. There is no column,
  anywhere, for who an offering is for.
- **Customer actions in the service process.** UFO-S has the customer as an
  actor in the service process, not only its beneficiary. Verified: every row in
  `booking_tasks` resolves to an internal `role_id`/`assignee_id`, and a search
  of `src/` and `supabase/migrations/` for any client-visible or client-performed
  task concept returns nothing.

---

## 2. TM Forum SID — the layer between what is sold and what does the work

Telecoms' answer, hardened over two decades of billing real money. It splits
service into two:

- **Customer Facing Service (CFS)** — bound to a Product. What the customer
  obtains.
- **Resource Facing Service (RFS)** — bound to a Resource. Not commercialised;
  what makes the CFS possible.

Above them sits the ProductOffering: *customers obtain Products, not Services.*
One service may appear in several Products with different packaging and pricing.

**What it names that we have.** The CFS/Product split is our SERVICE/PACKAGE
split, and the "one service in many Products at different prices" rule is
exactly why `package_services` exists and why a booking line points at a private
copy of a package rather than at the catalogue.

**What it names that we cannot say.** We have no resource layer worth the name.
Verified against the live schema: of 53 tables, the only resources are people
(`employees`, `employee_roles`, `roles`, `assignments`, `attendance`) and opening
hours (`studio_hours`: `weekday`, `week_of_month`, `on_date`, `opens_at`,
`closes_at`, `closed`). There is **no equipment, no room or space, no
consumable, no inventory**. A service that needs the one backdrop, or the one
large-format printer, cannot say so — and therefore two bookings can promise the
same irreplaceable thing at the same hour and nothing notices.

This is not the same gap as capacity. `studio_hours` says *when the studio is
open*; nothing says *how much it can do at once*.

---

## 3. Faceted classification (Ranganathan, 1933) — and the one canon we enforce

The first analytico-synthetic scheme. Its machinery: a **characteristic of
division** cuts a subject into a **facet**; a facet is a group of **isolates**
under an umbrella term; isolates of equal rank form an **array**; broader-to-
narrower forms a **chain**; a class number is then **synthesised** in a fixed
**citation order**. Every subject belongs to one and only one **basic subject**,
which is the first facet. The **Canon of Exclusiveness** holds that an entity
belongs to one and only one array.

This is our dimension system, nearly term for term, and it was built without
reading him:

| Ranganathan | Ours |
|---|---|
| basic subject | `service_domains` |
| facet | `dimensions` (with its `question`) |
| isolate | `dimension_values` |
| chain | `dimension_values.parent_id` |
| citation order | `dimensions.position` |
| facet schema per basic subject | `service_domain_dimensions` |

**The canon we enforce, and the asymmetry that matters.** Verified in the live
schema:

- `booking_dimension_values` is **UNIQUE (booking_id, dimension_id)** — one
  value per facet. Exclusiveness, enforced.
- `service_dimension_values` has primary key **(service_id, dimension_value_id)**
  and no uniqueness on the dimension; so does
  `package_service_dimension_values` on `(package_service_id, …)`.

So an **offering spans an array; an instance picks an isolate**. That asymmetry
is the structural difference between what the studio is prepared to do and what
it has agreed to do, and it is already load-bearing. It should be stated in
doc 02, which does not currently say it.

**What he names that we cannot say.** Ranganathan's canons require a
characteristic of division to be *relevant, objective and permanent*, and warn
that his own scheme's determinations are not unequivocal — the same subject can
be classified many ways. We let a studio invent its own facets, which is right
(doc 02's proliferation rule), and we give it no help at all in telling a facet
from a value. That is a design problem, not a schema gap, and it is ours.

---

## 4. Feature models (FODA, 1990) — the constraint we cannot express

Software product lines face our exact problem: one thing, configured many ways,
sold as a definite offer. Their vocabulary:

- a feature tree, each child **mandatory** or **optional**;
- **alternative** siblings, a mutually exclusive choice;
- and crucially, **cross-tree constraints**: `requires` and `excludes` (mutex).

A configuration is valid iff it violates no constraint.

**What it names that we have.** The tree is ours: a package fixes some answers
and leaves others "to the member" (`package_variable_values`,
`package_member_answers`). `variables.kind` with `options`, `min_value`,
`max_value` is the mandatory/optional/alternative layer. And we have one
genuine cross-tree constraint already —
`20261021000000_a_question_only_where_it_applies` added
`variable_dimension_values`, so a question is asked only for named values of its
dimension, with *no rows meaning every value*: "silence is permission".

**What it names that we cannot say.** `requires` and `excludes` between answers.
Verified: a search of `supabase/migrations/` for any requires/excludes/mutex
concept returns two incidental word matches and nothing structural. We can
condition **a question** on an answer. We cannot condition **a promise** on an
answer — and "the engagement session is included on events of six hours or
more" is on nearly every wedding price sheet in the trade (§7).

Note the shape of the existing solution, because the missing one should match
it: the constraint lives in its own table, names the values it applies to, and
treats absence as universality.

---

## 5. The service blueprint (Shostack, 1984) — the line we do not have

A bank executive's planning tool, so a manager could test a change to a service
on paper. Its rows: **customer actions**, **frontstage** contact-employee
actions, **backstage** contact-employee actions, **support processes**,
**physical evidence**. Its one original divider is the **line of visibility**,
separating what the customer sees from what they do not. Later hands added the
lines of interaction and internal interaction, duration per step, and **fail
points** (anywhere satisfaction or quality may be affected) and **bottlenecks**
(where waiting will exceed tolerance).

**What it names that we have.** `workflows` → `workflow_tasks` → `booking_tasks`
is the backstage and support-process rows, with `default_role_id` naming who
does each. Doc 02's workflow ruling — packages hold only departures, bookings
hold only what happened — is a blueprint that stays live rather than frozen.

**What it names that we cannot say.** Three of its five rows:

- **customer actions** — the client is never an actor in a workflow;
- **the line of visibility** — no task is marked seen or unseen, so the portal
  cannot be derived from the workflow and must be hand-built against it;
- **physical evidence** — nothing records what the client is handed or shown at
  a step, though `deliverables` covers the end of it.

Fail points and bottlenecks we have in a different and arguably better form:
doc 12's readings, derived rather than declared.

The practitioner's warning is worth keeping: *customer pain above the line is
usually caused below it.* That is an argument for the line existing, not for
drawing it in the portal.

---

## 6. Lovelock (1983) — five schemes, and the three we cannot answer

Services marketing's classic, and the broadest of these sources: five
classification schemes, each a 2×2, each chosen for the *strategic* question it
settles.

**1. Nature of the service act** — tangible/intangible × people/possessions.
People processing, possession processing, mental stimulus processing,
information processing.

> *Ours.* This is our `generative`/`transformative` distinction seen from
> outside: a shoot is tangible action on people, a restoration is tangible
> action on possessions, a print is possession processing of an asset.
> **Status: half-present.** It lives as a hardcoded property of
> `service_templates`, not as an edge on a service. `services` once had
> `required_input_deliverable_id`; it was dropped in
> `20260810000001_cleanup_required_input.sql` and never replaced. So Event
> Photography and Fine Art Printing are structurally identical rows.

**2. Relationship with customers** — membership vs no formal relationship ×
continuous delivery vs discrete transactions.

> **Status: absent, and the deepest of the gaps.** We model only the
> bottom-right cell: a discrete transaction with no standing relationship.
> `bookings` is one engagement with one nullable `contact_id`. We cannot say
> "this client is on a retainer", "this school has us for the year", "this
> family are members". Doc 02 §1 defines a service as a transformation, which
> *excludes* a commitment that transforms nothing until called upon — and
> membership, standby and retainer are all of that shape. Lovelock's scheme and
> UFO-S's commitment arrive at the same place from opposite directions.

**3. Customisation and judgement** — wide choice vs standardised × personnel
judgement limited vs free.

> *Ours, and well served.* Families are the wide-choice cell; a fixed package is
> the standardised one. Judgement, though, is about **who decides at the
> moment of delivery**, and we record nothing of it. Low priority: this is a
> management question, not a structural one.

**4. Nature of demand and supply** — relative to capacity, and predictable vs
random fluctuation. Services cannot be inventoried, so excess demand is lost.

> **Status: a quarter present.** `studio_hours` gives supply-as-opening-hours.
> There is no capacity, no concurrency limit, no notion that two bookings
> compete for one thing (§2). Lovelock's point — that unserved demand is simply
> lost — is the commercial argument for the resource layer.

**5. Method of service delivery** — customer comes to provider vs provider goes
to customer × single site vs multiple × direct vs arm's length.

> *Partly ours, and in an interesting place.* `dimension_values.at_premises` is
> a boolean on a **classification value** — so "Studio" vs "Outdoor" carries
> where the work happens, and the premises flag lets the studio's own address
> answer a location question automatically. That is Lovelock's first axis,
> discovered through the back door. The other two axes are absent.

---

## 7. The commercial structure of photography — which unit carries the margin

The trade's own history, which is one long argument about **which unit carries
the margin**, because the shoot itself has always resisted pricing:

| Unit | Where | Mechanism |
|---|---|---|
| the print | portrait studios, c.1880s–2000s | sitting fee recovers cost; prints carry profit |
| the digital file | portrait and wedding, 2010s– | bundled, per-image, or premium |
| the hour of coverage | weddings, events | tiers differing mainly by hours |
| **the right to use** | commercial, editorial | creative fee + licence fee + expenses |
| the head | school, sports, volume | per-subject orders; commission to the institution |

Three consequences for us.

**Our central price ruling is the trade's own primitive.** Doc 02 holds that *a
service is never priced; a unit of the way it varies can be.* Every model above
prices a unit — per print, per file, per hour, per usage, per head. We did not
invent that; we recovered it. This is the strongest external confirmation the
commercial plane has.

**Licensing is a priced right over an existing asset, and we have nothing.**
Verified: a case-insensitive search of `src/` and `supabase/migrations/` for
licence, usage right, copyright or exclusivity returns one incidental hit in
`MarkdownEditor.tsx`. The structure is three separable parts — creative fee,
licence fee, expenses — and the licence is priced on its own parameters: size,
placement, duration, territory, circulation, exclusivity. The photographer keeps
copyright; the licence is a lease. On re-licensing the creative fee is **not**
repeated.

That last sentence is why this is a structural gap and not a missing field: a
re-licence is **revenue with no work and no new deliverable**. Under our own
rule that a named amount with no work behind it is a charge, it collapses into
an unstructured charge line that cannot record which image, what usage, what
term, or when the right expires.

**The volume/school model breaks three of our assumptions at once.** The vendor
wins a contract for *exclusive access* and pays the institution a commission,
typically 10–20% of gross. Nobody pays the vendor for turning up; revenue
arrives only when parents order. So: the contracting party, the subjects and the
payers are three different sets (we have one `contact_id`); the money flows
backwards (we owe the client a share of gross); and exclusivity with a term is a
condition on the offering.

---

## 8. What the sources confirm we already have

Worth stating plainly, because the point of reading prior art is also to stop
rebuilding what is sound.

1. **The normative-description / offering / agreement / event layering** — UFO-S
   and SID both arrive at it.
2. **One service, many offerings, different prices** — SID says it outright; our
   package-copy-per-booking rule implements it.
3. **Faceted classification with a per-domain facet schema** — Ranganathan, term
   for term, independently reached.
4. **Offering spans an array, instance picks an isolate** — enforced in the
   schema; unstated in the docs. Doc 02 should say it.
5. **Absence means universality** — our classification kernel, the premises flag
   and `variable_dimension_values` all keep this rule. FODA's feature models
   need the same convention and get it by stipulation.
6. **Pricing the unit of variation, never the service** — the photography trade's
   own primitive.
7. **A live workflow rather than a frozen one** — Shostack's blueprint was
   explicitly a *planning* tool meant to be re-tested; freezing it per booking
   would have been the wrong reading.

---

## 9. The gap register

Ranked by how many independent sources found the same hole, then by cost.

| # | Gap | Independent confirmations | Shape |
|---|---|---|---|
| 1 | **Eligibility — to whom an offering is made** | 3 — UFO-S target customer community; Lovelock's membership axis; school exclusive-access contracts | a condition on an offering |
| 2 | **Commitment without transformation** (retainer, standby, membership) | 3 — UFO-S commitment; Lovelock scheme 2; "nobody pays you to show up" | amends doc 02 §1 |
| 3 | **The transformation's input end** (and so `generative`/`transformative` as a derived fact) | 2 — Lovelock scheme 1; our own template library carrying it in prose | an edge, restoring what `20260810000001` dropped |
| 4 | **A resource layer** — equipment, rooms, the one printer | 2 — SID's RFS; Lovelock scheme 4 | new entity + a conflict reading |
| 5 | **The conditional promise** (`requires`/`excludes` on answers) | 2 — FODA cross-tree constraints; every wedding price sheet | a table shaped like `variable_dimension_values` |
| 6 | **The right as a priced thing** (licensing) | 1 — commercial photography, but the largest revenue consequence | new entity |
| 7 | **Customer actions and the line of visibility** | 2 — UFO-S axiom SD01; Shostack's two missing rows | a flag + an actor on a task |
| 8 | **One engagement, many payers** | 1 — the school model | deepest change, narrowest need |

Two of these are the same build. Gap 3 is the identity floor doc 02 needs — a
service that cannot say what it transforms cannot say what it is — and the input
edge is also the **flow between services** that this research began by asking
for: a service whose input is another's output is the dependency, and the
dependency is the flow.

---

## 10. What this document does not do

It rules nothing. It does not amend doc 02 §1, does not add the input edge, does
not create an eligibility condition, and does not touch
`src/lib/types/engine.ts:141`, where `status: 'active' | 'archived'` still
disagrees with the `'active' | 'retired'` the domain layer writes.

Those are decisions, and they are the operator's to make. This is the evidence
they should be made against.

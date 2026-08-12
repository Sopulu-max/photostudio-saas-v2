# The Blueprint

**What this is.** A map of the whole system: every layer, what owns what, and how
the parts connect. It is meant to be buildable from — if you are adding anything,
this tells you where it goes and, more often, that it doesn't need to be added.

**Its relationship to [02-ONTOLOGY](02-ONTOLOGY.md).** The ontology says *what
exists* — services, packages, bookings, the planes, the spine. This says *how
what exists is held and read*. It adds nothing to the ontology's vocabulary and
removes nothing from it. It is the mechanics layer that the ontology assumed and
never wrote down, which is why several of its rules read as assertions rather
than consequences. Three of them stop being assertions here:

| Ontology says | Because |
|---|---|
| Categories are projections | A category is a *reading* of an edge, not a thing |
| A dimension value never becomes a service | Values sit on the far side of an edge; services on the near side. Promoting one crosses the graph |
| Packages select, they never redefine | A package links to values. It has no verb for creating them |

---

## 1. The spine

```
STUDIO                    the tenant. Owns domains, and nothing else directly.
  └── SERVICE DOMAIN      a capability the studio operates in: Photography,
      │                   Videography, Printing. THE boundary — everything below
      │                   belongs to exactly one, with no studio-wide escape.
      │
      ├── DIMENSION       a question this domain asks about its work.
      │   └── VALUE       an answer. Values may nest (Outdoor → Beach).
      ├── OUTPUT TYPE     a KIND this domain can produce.
      ├── BLUEPRINT       a process this domain runs.
      └── SERVICE         a transformation. Links to values, output types,
                          and a blueprint — all from its own domain.

PACKAGE     bundles services and gets SPECIFIC. Crosses domains freely.
BOOKING     instantiates packages for a client; creates the work.
```

Read that column of arrows twice. Everything under a domain is the same shape:
**a vocabulary the domain owns, and things that link to it.** Dimension, output
type and blueprint differ in what they mean, not in how they are held.

---

## 2. The mechanics

Four ideas. Everything else follows from them.

### 2.1 Scope → vocabulary → values → links

Every layer is these four. The studio scopes domains. A domain owns vocabularies.
Each vocabulary has values. Entities link to values.

Nothing is a column. Nothing is an enum. Nothing is a fixed five. When something
is written as `const DIMENSIONS = [...] as const`, the studio has been locked out
of its own business, and every downstream limitation traces back to that line.

### 2.2 Features are readings of edges

Every relationship is an edge. Most features are a *direction* of one:

| Edge | Forward | Backward |
|---|---|---|
| service ↔ dimension value | narrow the service form | **the lens**: what does this studio do for Birthdays? |
| invoice ↔ payment | what's outstanding | **the receipt** |
| promise ↔ delivery | what a package owes | **fulfilment** |
| entity ↔ event | an item's history | **notifications** |
| package ↔ service | what's bundled | where is this service sold? |
| booking ↔ assignment | who's on this booking | what is this person on? |
| blueprint stage ↔ role | what a package needs staffed | which packages need a retoucher? |

Receipts, fulfilment and notifications are the same move: read an existing edge
from the other end. They were each built separately, as if each were its own
insight. They were one insight three times.

> **The test, before adding any entity:** find the edge that already holds the
> fact, and ask what reading it from the other side would give you. New tables
> are for new facts. Most features are new *questions* about facts already held.

Three entities were proposed on this project and correctly rejected by that test:
`Offering`, `Configuration`, and a `receipts` table. Each was an existing edge
read from an unfamiliar angle.

### 2.3 Relatedness is derived, never declared

Wedding relates to On-location because services carry both. Nobody types that.

The same derivation gives every other kind of relatedness in the system:
services that sell together suggest bundles; roles that staff together suggest
crew; output types that ship together suggest package contents.

No `*_relationships` table should ever be needed. Co-occurrence over existing
edges is the relationship.

### 2.4 The engine seeds; the studio owns

The template library ships real knowledge — Portrait Photography produces edited
photographs, happens in-studio or outdoors, has a subject of Person. That is
seeded co-occurrence, and it is why the form is useful on day one.

The studio then extends it by working. Its own services teach the same graph.

Two consequences, both non-negotiable:
- **Every list is a suggestion, never a limit.** Any control offering known
  values must also accept an unknown one, and what is typed becomes known.
- **Seeded rows are ordinary rows.** The five dimensions that ship are
  renameable, deactivatable and deletable exactly like one a studio invents. No
  badge, no lock.

---

## 3. The map

### 3.1 Studio (kernel)

Owns identity, currency, document details (contact, payment instructions,
footer), and the domains it operates in. Nothing classifies at this level.

### 3.2 Service Domain

The boundary. Owns dimensions, output types, blueprints, services.

A studio adding Printing next year starts it clean — it does not inherit
Photography's contexts. Two values with the same name in different domains are
different rows and different facts.

### 3.3 Service

A transformation: what the studio knows how to do, independent of how it is sold.

- links to **dimension values** — what it is constrained to
- links to **output types** — what KIND it produces
- links to a **blueprint** — how it is carried out
- declares **variables** — what can vary about the work (outfits, coverage hours)

A service says *kind*, never *quantity*. "Edited photographs" — not six of them.

### 3.4 Package

The commercial layer, and the only place things get specific.

- bundles **services**, across domains if it likes
- **fixes** service variables, or leaves them open to become client questions
- **specifies** deliverables: quantity, unit, spec — "6 edited photographs",
  "30 second video", "20x30 framed print"

> **Type → promise → instance.** An *output type* is the kind (service level).
> A *deliverable* is that kind promised and specified (package level). An
> *asset* is the actual file (production level). One chain, three altitudes.

### 3.5 Booking

Intake from the outside world. A client, packages, a date, and the work that
follows. Line configuration is **snapshotted**, not referenced: re-scoping a
package next month must not rewrite what a client already agreed to.

### 3.6 Production, Delivery, Finance

- **Production**: blueprint stages become tasks; tasks carry assignments. A
  booking's team is the union of role-fills and task assignments — never a
  separate roster.
- **Delivery**: assets gathered into a container, shared by token; what was
  promised is checked against what was shared.
- **Finance**: money has a *kind* (charge/refund/expense) with direction derived
  from it. Invoices are generated from booking lines and frozen on issue.
  Receipts are per payment. Paid state is derived, never stored.

---

## 4. Rules, as tests you can apply

| Question | Test |
|---|---|
| Should this be a new entity? | Is there an edge that already holds the fact? Read it backwards first |
| Should this be a new service, or a package? | Is it a **different process**, or the same process framed differently? Different process → service |
| Should this be a new dimension, or a value? | Is it a *question* you ask, or an *answer*? |
| Where does a quantity go? | Never on a service. Packages are where things get specific |
| Should this list be closed? | No. Suggest from knowledge, accept anything, learn what's typed |
| Two records of one fact? | Derive one from the other. A stored flag beside its own evidence will drift |
| Dropping a table? | `grep -rn "from('<table>')" src/` first. Schema and the code that reads it move in **one commit** |

---

## 5. Status

| Piece | State |
|---|---|
| Domain owns dimensions / output types / blueprints (storage) | **Built**, verified row-for-row |
| Studio can add its own dimensions and values | **Built** — Services settings |
| Domain → service → value narrowing in the form | **Built** |
| Combobox: see the list, type anyway | **Built** |
| Service form renders the domain's *actual* dimensions | **Not built** — still the hardcoded five |
| Old five value tables + junctions removed | **Not done** — restored as scaffolding; goes with the line above, in one commit |
| Deliverable specs (quantity/unit/spec) | Stored, read, rendered — **no editor field** |
| Value hierarchy (`parent_id`, Outdoor → Beach) | Stored, **unused** |
| The lens (enter from a value) | **Not built** — needs `whatCarries()` / `whatCoOccursWith()` |
| Invoices, receipts, PDFs, documents | **Built** |
| Notifications as an event projection | **Built** |
| Booking team derived from work | **Built** |

---

## 6. What to build next, and why in this order

1. **Move the service form onto the domain's dimensions**, delete the five flat
   tables, in one commit. Until this lands, a studio can define a dimension it
   cannot use — the system contradicts itself in the one place a studio looks.
2. **Traversal as a first-class read** — `whatCarries(value)`,
   `whatCoOccursWith(value)`. Small, and three features fall out of it.
3. **The lens**, as a thin surface over (2): enter at Birthday, see what this
   studio does for birthdays, and leave with either a package or — if the
   process is genuinely different — a new service.
4. **Value hierarchy** in the UI: Beach is an Outdoor, and selecting backwards
   into the parent is how a studio navigates its own vocabulary.

Everything after that is the same shape as something already built. If a proposal
does not look like something on this page, that is the signal to re-read it
rather than to write it.

# 11. Bookings: Information Architecture

*The deconstruction that precedes the Bookings page. What information exists
about bookings, where it comes from, how it relates, what is stored and what is
derived, what a studio needs to understand and act on — and only then, what the
interface must be to represent that structure truthfully.*

*Written 2026-09-22 against the live schema and `02-ONTOLOGY.md`. Sections 1–8
are the information. Section 9 derives the interface. Section 10 lists what is
deliberately absent.*

---

## 0. Method

The page is a representation of an information structure. Every element on it
must be traceable to a row, a relationship, or a derivation named here. If an
element cannot be traced, it is decoration and does not belong. If a piece of
information named here has no element, the page is incomplete.

Rules carried from the rest of the architecture:

- **Model identity, not behaviour.** The page reads state; it stores nothing for
  its own sake.
- **Edges, not entities.** Most of what the page shows is a *reading of an edge*:
  booking→contact, booking→date, booking→stage, task→assignee.
- **The studio's vocabulary is data.** Stage names, roles, dimensions, task
  names and people are read off rows. The app names only its own concepts:
  stage *kinds*, the calendar, absence.

---

## 1. The subject

From the spine (`02-ONTOLOGY.md §3`):

```
SERVICE → CONFIGURATION SCHEMA → PACKAGE → BOOKING
```

**A booking is what one client actually engaged.** It instantiates one or more
packages for a client and, in doing so, creates production work. It is the
intake unit of the studio (`bookings-as-entry-point`): everything from the
outside world — an enquiry, a storefront form, a walk-in — becomes a booking,
possibly with almost nothing on it, and grows (progressive enrichment).

A booking touches all three planes:

| Plane | On a booking |
|---|---|
| Semantic | what it is for — its classification (Occasion, Context, …); its brief |
| Commercial | what was sold — its lines (package instances), their price, extras; its contract |
| Production | what must be done — the tasks of each service of each package; who does them; what they produce |

The page is about the booking as a **job**, across all three planes. Money —
the commercial plane's *settlement* — is excluded by ruling (§10); the
commercial *agreement* (the contract) is not, because it is what turns an
enquiry into a booking.

---

## 2. Inventory: sources and fields

Every table that contributes, and what each contributing field *means*. Fields
that exist but do not contribute (share tokens, cover images, metadata blobs)
are omitted.

### 2.1 `bookings` — the job itself

| Field | Meaning | Contributes |
|---|---|---|
| `id` | identity | key for every edge below |
| `title` | the job's name; auto-derived from client + package unless `title_custom` | naming a row |
| `contact_id` → `contacts` | **the client** (nullable — a booking may exist before a client is known) | identity; absence = *no client* |
| `stage_id` → `booking_stages` | **where the studio says it is** (nullable — a booking may have no stage) | status; absence = *no stage* |
| `scheduled_for` | **when the session is** (nullable) | time; absence = *no date* |
| `duration_minutes` | how long the session is | time (secondary) |
| `brief` | free text from intake | context (secondary) |
| `created_at` | **when the job entered the book** | age; "waiting since"; period figures |

### 2.2 `booking_stages` — the studio's own vocabulary of position

| Field | Meaning |
|---|---|
| `name` | the studio's word ("Enquiry", "Booked", "Delivered", …) — **data, never named in code** |
| `kind` | the app's reading: `enquiry` · `booked` · `completed` · `cancelled` — **the only status vocabulary code may name** |
| `position` | the studio's order |
| `color` | the studio's chosen look |

A stage is a *declared* position: the studio moves a booking. The kind lets code
reason (live vs closed; enquiry vs agreed) without knowing the studio's words.

### 2.3 `booking_lines` — what was sold on this job

| Field | Meaning |
|---|---|
| `package_id` → `packages` | **the package instance** (`packages.instance_of` → the catalogue package it was copied from); null for a bare charge |
| `title` | the line's own name when it is not a package |
| `price`, `quantity` | commercial (not read here) |

A booking with no lines has **no package** — it is a title and perhaps a client.

### 2.4 The questions, and this booking's answers

A package fixes some things and **leaves others open**; the open ones are
asked at booking. Which ones is not knowable in advance: every studio's
packages leave different questions open, and a studio that grows will leave
new ones. The page can therefore know a question only by its **structure**,
never by its name.

| Table | Field | Meaning |
|---|---|---|
| `variables` | `label` | the question's name — the studio's word ("Occasion Date", "Number of outfits") |
| | `kind` | **what an answer is**: `text` · `textarea` · `number` · `date` · `choice` · `multichoice` · `boolean` · `url` · `size` — the only thing about a question code may reason from |
| | `unit` | for a number: outfits, prints, hours |
| | `service_id` \| `dimension_id` \| `deliverable_id` (exactly one) | where the question comes from: what a service lets vary; what a classification opens (Occasion → its date; Context: Outdoor → an address); what a deliverable asks |
| `package_variable_values` | `answered_by` | **who answers**: `studio` (fixed in the package) · `client` (left open — asked at booking) · `member` (left to a family member) |
| `booking_line_variable_values` | `value`, `source` | **this booking's answer**, and whether the studio or the client gave it |

Whether a question is *asked* on a given line is a real rule (classification
narrowing settles some; a family member may have answered; a value may close a
question another opens) and it lives in one place, `getPackageVariables` /
`getLineConfigurationForm`. The page **reuses that rule**; it never re-derives
"asked".

The label a booking sees is **its own**: a package's "Occasion Date" becomes
"Anniversary Date" once this booking says Anniversary (`labelledByAnswer`).

**Meaning for the page, by kind — never by name:**

| Kind | An answer is | Where it belongs |
|---|---|---|
| `date` | **a calendar fact** distinct from the session — the occasion's own date | a session row; potentially the calendar |
| `textarea`, `text`, `url` | what the crew needs on the day (an address, a brief) | a session row |
| `number` + unit, `size` | a quantity the work is sized by | a session row; the day book caption |
| `choice`, `multichoice`, `boolean` | a selection | a session row |

And the **absence**: a question asked at booking with no answer is a fact the
day still lacks — an attention item in the same family as *no date* (§5, §6).

| Table | Meaning | Contributes |
|---|---|---|
| `booking_line_extras` | more of what a package promises, added on this booking | commercial; not read here |
| `booking_dimension_values` → `dimension_values` → `dimensions` | **what the job is for**, in the studio's own dimensions (Occasion: Birthday; Context: Outdoor) | classification axes — one per dimension the studio defined |

### 2.5 The work: `workflow_tasks` · `package_tasks` · `booking_tasks` → *resolved tasks*

No table holds "the tasks of this booking". They are a **reading**
(`production/resolve.ts`, `workflow-rulings`):

- `workflow_tasks` — the service's workflow *as it is now* (name, `default_role_id`, position)
- `package_tasks` — the package's *departures* from it (switched off, re-roled, own steps)
- `booking_tasks` — **only what happened on this booking**: `assignee_id`, `completed_at`, a role override, the booking's own steps. A row exists only once something happened.

Resolved, each task carries: name, position, `done` (`completed_at` set),
`roleId`/`roleName` (what kind of person it needs), `assignee` (a contact —
who is on it), `fromService`, `fromPackage`.

**Meaning:** the work is live — if the studio changes a workflow, every open
booking follows; a booking's tasks are never frozen. Therefore every work figure
on the page is computed at read time from these three tables.

### 2.6 The crew: `assignments` · `employees` · `employee_roles` · `roles`

| Field | Meaning |
|---|---|
| `assignments (booking_id, employee_id, role_id)` | **who is on this job, in what role** — declared crew |
| `booking_tasks.assignee_id` | who is on a *step* — the narrowing of the crew |
| `employees.contact_id` | the bridge: a person is a contact on a task and an employee on the crew |
| `employee_roles` | what each employee can do |
| `roles.name` | the studio's role vocabulary — data |

Two edges, one person; `getBookingTeam` reads both so they cannot disagree.

### 2.7 The agreement: `contracts`

| Field | Meaning |
|---|---|
| `status` | `proposed` · `active` · `modified` · `completed` · `cancelled` |
| `signed_at` | when it was agreed |

**Meaning for the booking:** an enquiry with a `proposed` contract is **awaiting
the client**; an enquiry with none is **awaiting the studio**. An `active`
contract is the agreement itself (a document freezes when it becomes one). This
is the only piece of the commercial plane the page reads, because it is the
decision edge.

### 2.8 The outputs: `assets` · `delivery_assets`

| Field | Meaning |
|---|---|
| `assets.booking_id`, `deliverable_id`, `state`, `produced_by_line_id` | what has been made for this job and what it is |
| `delivery_assets` | what has been handed over |

**Present on the booking, not on this page** — delivery is a gallery's reading
(`gallery-not-delivery`). Noted so the boundary is deliberate (§10).

### 2.9 `notes` (`about_type = 'booking'`, `remind_at`)

A note on a booking with a reminder is a **dated obligation the studio set
itself**. Contributes to *what requires attention* when `remind_at ≤ now`.
(Not currently read by the page — a gap, §9.7.)

### 2.10 `events` (`entity_type = 'booking'`)

| Field | Meaning |
|---|---|
| `action` | `created`, `stage_changed`, `scheduled`, `unscheduled`, `client_set`, `crew_assigned`, … |
| `payload` | for `stage_changed`: `{ stage, kind }` |
| `created_at`, `actor_id` | when, who |

**Meaning:** the only record of *transitions*. A booking has no "agreed at"; the
`stage_changed → kind: booked` event is it. Recent events are the page's
"what changed"; windowed events are its "agreed this period".

### 2.11 The clock: `organizations` timezone

Every "today", "this week", "days waiting" is computed on the **studio's
clock**, not the server's (`kernel/bands.ts`).

### 2.12 Excluded by ruling: `invoices`, `invoice_lines`, `financial_transactions`

The commercial plane's settlement. Read on the booking's own page and in
Finances; **not on the Bookings page** (§10).

---

## 3. Relationships

```
                       contacts ──(client)──┐
                                            │
 booking_stages ──(stage: studio's word)── BOOKINGS ──(scheduled_for)── the calendar
        │ kind (app's reading)              │
        │                                   ├── booking_lines ── packages (instance_of → catalogue)
        │                                   │        └── package_services ── services ── workflow
        │                                   │                 └── tasks (resolved: workflow − departures + what happened)
        │                                   │                          ├── role (what it needs)
        │                                   │                          └── assignee → contact ⇄ employee (who is on it)
        │                                   ├── assignments ── employees ── roles       (the crew)
        │                                   ├── booking_dimension_values ── dimension_values ── dimensions   (what it is for)
        │                                   ├── contracts (proposed | active …)         (the decision)
        │                                   ├── assets → delivery                        (what was made — not here)
        │                                   ├── notes (remind_at)                        (self-set obligations)
        │                                   └── events (created, stage_changed …)        (transitions)
        └── position, color
```

Three relationships carry the page:

1. **booking → time** (`scheduled_for`, on the studio's clock) — the only axis
   every studio shares.
2. **booking → stage** (studio's word, app's kind) — the declared position.
3. **booking → tasks → assignee** — the actual position, and who holds it.

Everything else qualifies these: the client names the row; the packages say what
the job is; the dimensions say what it is for; the contract says whose move it
is; the events say when things moved.

---

## 4. Hierarchy

Within one booking:

```
BOOKING (the job)
 ├─ identity: title, client, what it is for (dimensions), brief
 ├─ position: stage (declared) · date (calendar) · decision (contract)
 ├─ LINES (what was sold)              ── one per package instance
 │    └─ SERVICES (of the package)     ── one per package_service
 │         └─ TASKS (of the service)   ── ordered; each: role, assignee, done
 └─ CREW (who is on the job)           ── one per assignment
```

Across bookings, there is **no stored hierarchy** — only groupings by a shared
value (same stage, same band, same client, same dimension value). Those are the
axes (§8), and they are equal: no one grouping is "the" hierarchy. The page must
not pretend one is (this is why a kanban by stage was wrong as *the* view).

The one hierarchy the page must communicate visually is the **within-booking**
one: a job → its services → their steps and people. A row that shows a booking
must be able to show where each of its services is.

---

## 5. Status and state

A booking has **five independent states**, from five different sources. They
must not be collapsed into one "status", and the page must not show one as if
it implied the others.

| State | Source | Values | Who sets it |
|---|---|---|---|
| **Stage** | `booking_stages.kind` via `stage_id` | enquiry · booked · completed · cancelled · *(none)* | the studio, by hand |
| **Time** | `scheduled_for` vs the studio's clock | undated · earlier · today · tomorrow · this week · later | the calendar |
| **Decision** | `contracts.status` | none · proposed · active | the studio proposes; the client agrees |
| **Work** | resolved tasks | no steps · in progress (done/total, unassigned count) · complete | the crew, step by step |
| **Life** | derived from kind | live (enquiry, booked, none) · closed (completed, cancelled) | follows stage |

Consequences the page must respect:

- *Booked + earlier + work in progress* is **post-production**, the normal
  middle of a job — not "overdue".
- *Enquiry + earlier* is a **date that passed without a decision** — a probable
  loss.
- *Booked + earlier + work complete + still live* is **ready to close** — the
  studio has not yet moved it.
- *Enquiry + proposed* is **awaiting the client**; *enquiry + no contract* is
  **awaiting the studio**.
- *Live + no date* cannot be placed on the calendar at all.

---

## 6. Derived values

Nothing here is stored. Each is a function of the fields above.

| Derived value | Derivation | Meaning |
|---|---|---|
| **band** | `bandOf(day(scheduled_for, tz), calendar)` | where the session sits relative to now |
| **live / closed** | stage kind ∉ {completed, cancelled} | whether the job still carries work |
| **work** | resolve tasks → total, done, unassigned, per-service first open step + assignee | where the job is, actually |
| **needs (roles)** | roles of open unassigned tasks | what kind of person the job still lacks |
| **missing** | the absent edges on a live booking: client · date · package · decision (studio / client) · crew (booked, upcoming, unassigned step) | what requires attention, by absence |
| **days waiting** | today − day(created_at) | how long a job has sat |
| **days since session** | today − day(scheduled_for), when earlier | how long post-production has run |
| **post-production** | booked · earlier · work in progress | the middle of the job |
| **ready to close** | booked · earlier · work complete · live | the end the studio has not declared |
| **new in period** | count of `created_at` in [from, to] | intake |
| **agreed in period** | distinct bookings with `stage_changed → kind: booked` in [from, to] | conversion events |
| **conversion** | agreed ÷ new | the rate a studio watches |
| **sessions in period** | booked/completed with day in [from, to] | work held |
| **pipeline** | count per stage, in the studio's order; per stage the fact for its kind | declared positions |
| **classification axes** | one per dimension present on any booking | what jobs are for |
| **facts** | this booking's answers, said by kind (a date as a date, a number with its unit), dates first | what the package left open and the booking settled |
| **unanswered** | questions asked at booking (by the one rule) with no answer | what the day still lacks |

What is **not** derivable, and therefore not shown: time in stage (no stage-
entered timestamp except through events; could be derived from `stage_changed`
history — a later step), revenue anything (excluded), delivery status (a
gallery's reading).

---

## 7. What the user needs to understand or act on

The reader is the studio operator. The moments, in order of frequency:

| Moment | Question | Information | Action |
|---|---|---|---|
| Start of day | What is today? | live · band = today, with crew per service | go, or fill a gap |
| Start of day | What is short before it happens? | booked · upcoming · unassigned steps | assign |
| Any time | What is waiting on me? | enquiry without proposal; live without client/date/package; reminders due | decide, propose, complete the record |
| Any time | What is waiting on a client? | enquiry with proposal | chase |
| Between sessions | What is in post-production, and where? | booked · earlier · work in progress; per service, step, who | push the step, assign |
| Between sessions | What is finished and not closed? | ready to close | move the stage |
| Weekly | Where is everything? | pipeline by stage, with the kind's fact | judge the shape |
| Weekly | Is the book growing? | new · agreed · conversion · sessions, vs previous window | judge the trend |
| When something is off | What changed? | recent events, named | trace |
| Any question not above | Show me the ones that … | the full instrument: narrow · group · read | investigate |

The needs sort into three kinds, which is the page's real top-level structure:

1. **Absences and obligations** — things that are *missing* or *due*: act.
2. **Positions** — where every job is on the calendar, in the stage, in the
   work: understand.
3. **Trends** — how the book moves over a period: judge.

---

## 8. Meaningful groupings (the axes)

A grouping is meaningful when it is a value rows genuinely share, read off the
data. Each is both a filter and a group-by on the instrument, and each dashboard
door names one.

| Axis | Source | Values |
|---|---|---|
| When | band | the calendar's words |
| Stage | `booking_stages` | the studio's words, its order, its colours |
| Needs | roles of unassigned open tasks | the studio's roles |
| Missing | the absent edges | the app's absences |
| *each dimension* | `booking_dimension_values` | the studio's dimensions and their values |
| Client, Package, Service | edges | the studio's names (not yet axes — could be) |

---

## 9. From structure to interface

Now, and only now, what the page must be — each element with its reason.

### 9.1 Top-level structure = the three kinds of need (§7)

The page has three regions, in reading order, because the needs have an order
of urgency: **act** (absences, obligations), **understand** (positions in time,
stage, work), **judge** (trends). Below them, **investigate** (the instrument).
This is the visual hierarchy: it is the hierarchy of need, not of data volume.

### 9.2 One headline, because five states need one sentence

A booking has five independent states (§5); the studio's day is the
intersection of a few of them. The headline states the day on the studio's
clock and the three numbers that decide it: sessions today, items requiring
attention, jobs in post-production. It exists because the state model is
multi-dimensional and the reader needs a single entry point.

### 9.3 "Requires attention" = the *missing* derivation, one row per absence

Its rows are exactly the values of the *missing* axis (§6), in the order a job
resolves them (decision → client → date → package → crew), plus reminders due
(§2.9). Each row: the count, the absence, the longest wait (because age is the
urgency), a sample of the bookings (because a count alone cannot be acted on),
and a door to the instrument narrowed to that absence. Nothing else belongs in
it: an absence not in the model is not an attention item.

### 9.4 "Today" and "Upcoming" = booking → time, live, with the crew edge

Rows are live bookings by band, soonest first. Each row shows the fields the
moment needs: time, client, job, and **the crew edge** — the first unassigned
step if any (what it lacks), else the first open one (where it is), and the
stage. Today is separated because its rows are acted on now; the rest of the
week is context.

### 9.5 "Post-production" = booked · earlier · work in progress

A distinct region because it is a distinct state (§5), and because it holds the
studio's daily labour. Rows ordered by days since the session (age is
urgency), each showing the open positions with the unassigned first, and
progress done/total. "Ready to close" rows follow, because they are the same
bookings one step later.

### 9.6 "Pipeline" = booking → stage, in the studio's order

One segmented bar (the shape) and one row per stage (the studio's word, colour,
count, share) with **the fact for its kind**: an enquiry stage's longest-waiting
booking; a booked stage's next session and its split into ahead / in
post-production. Kind is the app's; the words are the studio's.

### 9.7 What the current page lacks against this model

- **Reminders due** (`notes.remind_at`) are an obligation the model has and the
  attention region does not show.
- **Enquiries whose date has passed** (enquiry · earlier) are a probable loss
  the attention region does not name. They are "awaiting decision" today, but
  their age is understated: the *session date* passed, not merely the enquiry.
- **Crew on today's session by service**: the session row shows one position;
  a multi-service session (photo + video) has several. The row should carry the
  within-booking hierarchy (§4) — one position per service — as the day book row
  already does.
- **The answers** (§2.4): a session row must carry what the booking answered —
  the occasion's date, the address, the quantities — by kind, and name what was
  asked and not answered. The rows showed none of it.
- **Unanswered questions across all live bookings** as an attention row needs
  the *asked* rule batched; today it runs per line, so it is read only for the
  sessions ahead. A batched form of `getPackageVariables` is the step that
  unlocks the count.
- **Time in stage** is not derivable without reading `stage_changed` history;
  worth deriving for the pipeline's "longest waiting" (currently days since
  created, which overstates for a booking that moved recently).

### 9.8 What the current page has that the model does not justify

- "Recent activity" is justified (§2.10) but its weight is not: it is a trace,
  read when something is off. It belongs last and small.
- The twelve-month series draws one measure; the model has three. Fine — but the
  toggle is the only reason for a chart to exist here, and the chart should
  read as "the period, extended", not as a separate panel.

### 9.9 Representation rules

| Information class | Representation | Why |
|---|---|---|
| a count of absences | a large numeral, warm when > 0 | it is the call to act |
| an age (waiting, since session) | mono figure + unit, leading the row | urgency is time |
| a stage | the studio's colour and word, as a pill | declared, categorical |
| an assignee / unassigned | name, or "Unassigned" in warm | the crew edge, present or absent |
| progress | done / total, with a short bar | a ratio |
| a share of the whole | segmented bar + legend | a distribution |
| a period figure | numeral + delta vs previous window + sparkline | a measure with its trend |
| an answer | `label value`, dates first, in the row's second line | a fact the booking settled, said by its kind |
| an unanswered question | its label, warm, "unanswered" | a fact the day lacks |
| a relationship to detail | a link: row → booking; count → instrument narrowed | every widget is a door |

---

## 10. Deliberately absent

| Not on the page | Why |
|---|---|
| Money (owed, collected, invoices) | ruling: Finances' page; the bookings page is every booking as a job |
| Delivery / galleries | a gallery's reading (`gallery-not-delivery`) |
| Cover images | set aside on list surfaces |
| A kanban by stage as the primary view | stage is one axis among equals (§4) |
| Fixed "quick filters" named in code | every grouping is read off the rows (§8) |

# 12. Bookings: the kinds of information, and how each becomes readable

A second deconstruction of the same subject as doc 11, from a different
direction — and the answer to two observed failures of the page doc 11 produced.

---

## 0. Why a second pass

Doc 11 deconstructed **one booking**: every contributing field (§2), the
relationships (§3), the within-booking hierarchy (§4), the five independent
states (§5), the derived values (§6), the operator's needs (§7), the axes (§8).
From that it derived a page of **lanes** — cuts of bookings by need — and one
element, the strand, carrying every plane at once.

Two things that page got wrong, both reported by the operator:

1. **The marks need a key.** The strand encoded four states into a 12px circle
   (filled · warm ring · accent ring · grey ring), a session as a solid diamond
   and an occasion as a hollow one, a reminder as a tick. The page had to ship a
   **key row** to explain itself. A display that needs a legend has failed before
   it is read; the legend is the evidence, not the remedy.
2. **A display does not say what it is reading.** A column of dots does not
   announce that the third one is the date edge. The reader must infer the
   source from position. Inference is not reading.

Neither failure is a styling matter and neither is fixed by spacing. They come
from a missing step: doc 11 never asked, of each item of information, **what
shape it has** and therefore **what display makes it readable without
explanation**. Nor did it ask what each item *becomes* when read across the
whole book rather than within one job — which is the step that produces
sections rather than lanes.

This document supplies both. §9 of doc 11 (structure → interface) is superseded
by §5 here where the two disagree.

---

## 1. The readability laws

Derived from the two failures, and binding on every element on the page.

**Law 1 — No legend.** If the page must explain a mark, the mark is wrong.
Nothing on the page may require a key row, a colour key, or a hover to be
understood. (Hover may *add* — a full timestamp, a longer name — never
*decode*.)

**Law 2 — A display names what it reads.** The label travels with the value:
`Session · Sat 26 Sept`, `Package · Standard Wedding`, `Steps · 2 of 5`. A
number with no noun attached is not information. Column headers satisfy this
only when the column is wide enough to keep its header in view and the value
under it is itself a word or a number — never when the value is a glyph.

**Law 3 — Words for what a thing is; numerals for how many.** A category is
its own word, in whoever's vocabulary owns it (§4). A quantity is a numeral
with its unit. Neither is ever a shape or a colour alone.

**Law 4 — Geometry only where the geometry is the meaning.** Position is
allowed when it is position *on a labelled scale* (a date axis carrying dates).
Length is allowed when the comparison across rows *is* the point (a share of a
total). Anything else — a dot whose fill means a state, a diamond whose outline
means a source — is a code, and codes need legends, which Law 1 forbids.

**Law 5 — Colour is emphasis, never the fact.** Warm may mark a thing that
needs the operator, but the thing must already say so in words. Remove all
colour and the page must still read correctly. (This also makes the page
correct for a reader who cannot distinguish them.)

**Law 6 — Absence is stated, not omitted.** An empty edge is a phrase — *No
package* — not a blank cell, and not an unfilled shape.

---

## 2. Every item of information, deconstructed

Grounded in doc 11 §2 (the schema), with the four properties doc 11 never
recorded. *Unit* = what carries the item. *Cardinality* = how many per booking.
*Shape* = the logical form of the value. *Absence* = whether not-having-it is
itself information.

| # | Item | Source | Unit | Cardinality | Shape | Absence means |
|---|---|---|---|---|---|---|
| 1 | the job's name | `bookings.title` | booking | exactly 1 | a name | — |
| 2 | the client | `contact_id` → `contacts` | booking | 0 or 1 | a name | *no client yet* |
| 3 | the brief | `bookings.brief` | booking | 0 or 1 | prose, the client's | nothing asked in words |
| 4 | when it entered the book | `created_at` | booking | exactly 1 | a point in time → an age | — |
| 5 | the session | `scheduled_for` + `duration_minutes` | booking | 0 or 1 | a point **and a span** in time | *not placeable on a calendar* |
| 6 | the stage | `stage_id` → `booking_stages.name`/`kind`/`position` | booking | 0 or 1 | a category, **ordered** | *never positioned* |
| 7 | the decision | `contracts.status` | booking | 0 or 1 | a category, **and whose move it is** | *awaiting the studio* |
| 8 | the packages | `booking_lines.package_id` → `packages` | line | 0..n | named things | *nothing is promised yet* |
| 9 | the answers | `booking_line_variable_values` + `variables.label`/`kind`/`unit` | line × question | 0..n | a **named typed value** (shape per `kind`) | a fact the day lacks |
| 10 | the questions still open | asked (`getPackageVariables`) − answered | line × question | 0..n | named absences | what the studio must still ask |
| 11 | what it is for | `booking_dimension_values` → `dimensions` | booking × dimension | 0..n (≤1 per dimension) | a category per dimension, studio's | unclassified on that dimension |
| 12 | the dimensions its packages leave open | `packageNarrowingsFor` − answered | booking × dimension | 0..n | named absences | a classification not settled |
| 13 | the steps | resolved tasks (`workflow_tasks` − `package_tasks` + `booking_tasks`) | step, **nested** package → service → step | 0..n, ordered | an **ordered sequence with a state per element** | *no steps defined* |
| 14 | who is on a step | `booking_tasks.assignee_id` → `contacts` | step | 0 or 1 | a name | *unassigned* |
| 15 | what a step needs | `roles.name` via task role | step | exactly 1 | a category, studio's | — |
| 16 | the crew | `assignments (employee, role)` | booking × person | 0..n | name + role pairs | *nobody on the job* |
| 17 | obligations | `notes.remind_at` | note | 0..n | points in time | — |
| 18 | what changed | `events.action`/`payload`/`actor_id`/`created_at` | event | 0..n, ordered | a **trace**: who · what · when | — |
| 19 | the clock | `organizations.timezone` | org | exactly 1 | not displayed; conditions every "today" | — |

Derived items (doc 11 §6) inherit the shape of what they are derived from:
`band` is a category over item 5; `work` is a count over item 13; `needs` is a
category-count over item 15; `days waiting`/`days since` are quantities over
items 4 and 5; `missing` is a presence-reading across items 2, 5, 7, 8, 14;
period figures are counts over items 4, 18 and 5.

---

## 3. What each shape becomes when read across the book

A section is one kind of information read across every job. That reading has a
form, and the form is a property of the shape — not a choice:

| Shape | Within one job | **Across the book** | Readable as |
|---|---|---|---|
| a name (1, 2, 14, 16) | the name | a **list**, ordered by something else | the text; names do not aggregate — they identify |
| a category (6, 7, 11, 15) | the word | a **distribution**: count per value + the residual *not set* | the word · its count; shares as bar lengths that carry their numbers |
| a named typed value (9) | `label value` | per label: a **count answered / unanswered**; per `kind: number` a **total with its unit**; per `kind: date` it joins the time axis | `Number of outfits · 23 outfits across 14 jobs` |
| a named absence (10, 12) | the phrase | a **count per question / per dimension** | `Occasion Date · unanswered on 6 jobs` |
| a point in time (4, 5, 17, and 9 where `kind = date`) | a date, and its distance from today | a **projection onto one labelled axis**, plus counts per bucket | the axis with dates on it; `N this week` |
| a span (5 with duration) | start–end | **collision** and **load** on the axis | `11:52–13:52`; two spans overlapping on the same day |
| an ordered sequence with state (13) | the **current element**, named, and `n of m` | count of open elements, grouped by what they need (15) | `Edit · Unassigned` · `2 of 5 done` · `3 steps need an Editor` |
| a presence-reading (missing) | the phrase | a **count per absence** | `No date · 15 jobs` |
| a trace (18) | — | **newest first**, who · what · which | a sentence per event |

Two consequences worth stating, because both were violated:

- **A name never becomes a mark.** Items 2, 8, 14 and 16 are names; rendering
  them as filled or hollow shapes destroys the only thing they carry.
- **Only items 4, 5, 9(date) and 17 are positions in time.** Everything else on
  the strand's axis was there by association, not by shape.

---

## 4. Whose vocabulary each item speaks

The hardcoding boundary, per item. Code may name only the right column.

| The studio's words (data — never in code) | The app's words (the only vocabulary code may name) |
|---|---|
| stage names and order (6), role names (15), dimension names and their values (11), question labels and units (9, 10), package names (8), people's names (2, 14, 16) | `booking_stages.kind`; `variables.kind`; `contracts.status`; `events.action`; the band words; the absence keys |

Therefore: a section per dimension, a row per role, a row per question label —
all **counted from the data**. A new dimension, role or question appears with no
code change; none may be named in a component, a class name, or a sort order.

---

## 5. The planes, counted — and the sections that follow

Group the items by **unit + shape**; the planes are what the grouping yields,
not what a layout wanted:

| Plane | Items | Unit | Its cross-sectional form |
|---|---|---|---|
| **Identity** | 1, 2 | booking | a list — this is the **spine**, not a section |
| **Promise** | 8, 9, 10 | line × question | named things; counts of answered / unanswered per question |
| **Classification** | 11, 12 | booking × dimension | a distribution per dimension, and its open count |
| **Time** | 4, 5, 17, 9(`date`) | booking / note / answer | one labelled axis + counts per bucket |
| **Work** | 13, 14, 15 | step (nested) | current element per service; open counts by role |
| **People** | 16, and 14 read from the person's side | booking × person | who is on what; who is short |
| **Position** | 6, 7 | booking | two distributions: stage, decision |
| **History** | 18 | event | a trace |
| **The clock** | 19 | org | conditions every other plane; never drawn |

**The correction this forces.** Board 7 opened with a section called *The
record*. That is not a plane: presence-of-an-edge is a **reading across four
different planes** (identity 2, promise 8, time 5, position 7). It still earns a
region, because absence is the operator's first need (doc 11 §7), but it must be
labelled as what it is — *what each job still needs* — and it must be **words**,
because a presence-reading's readable form is a phrase and a count (§3), not a
row of filled and hollow circles. That section was the worst offender against
both laws, and it was my invention, not the data's.

**People** likewise is not a section of its own: item 16 reads on a session
(who is coming) and item 14 reads on a step (who is on it). Its cross-sectional
form — *who the studio is short of* — is a count over item 15, which belongs
with the work. One plane, two readings, no third region.

So the regions, derived:

1. **What each job still needs** — the presence-reading, in phrases, warm-first,
   with a count per absence. *Act.*
2. **The promise** — packages on the book, and every open question by its own
   label with the count of jobs it is unanswered on. *Act.* (New: doc 11 had the
   unanswered fact only as a line under a session row; cross-sectionally it is
   a studio-wide list of what nobody has asked yet.)
3. **What the book is for** — a distribution per dimension, with its open count.
   *Understand.*
4. **The calendar** — the one place geometry survives Law 4: dated axis,
   sessions with their spans, occasions, reminders; counts per week. *Understand.*
5. **The work** — per job and service, the current step named and `n of m`, plus
   what the studio is short of, by role. *Act and understand.*
6. **Position** — stage and decision, as two distributions, each value its own
   word with its count. *Understand.*
7. **This period, and what changed** — counts over a window against the window
   before; then the trace. *Judge.*

The spine (identity) repeats in every region, same width, same place — so
scanning down assembles one job entire without any row carrying every plane.

---

## 6. What this rules out

- **The strand as the page's element.** It carries every plane in one row,
  which forces glyphs, which forces a key. It survives only where one job
  entire is the subject and there is room to say things in words — the booking's
  own page.
- **The key row.** Deleted, not redesigned. Its existence was the proof.
- **Point vocabularies** — filled / warm ring / accent ring / grey ring; solid
  versus hollow diamonds; reminder ticks. Each becomes the phrase it stood for.
- **Bars without numbers**, **colour-only states**, and any count without a noun.
- **A row of dots for a workflow.** A sequence's readable form is its current
  element named plus `n of m`; the whole sequence belongs on the booking, where
  each step has room for its own name.
- **Any section, row or column named after one studio's word** (§4).

---

## 7. What is still deliberately absent

Unchanged from doc 11 §10: money (invoices, transactions, line prices),
delivery state, cover images, and a kanban as the primary view. Added here: the
twelve-month series is the calendar's axis extended, not a second chart region;
and no region may exist whose only justification is symmetry with another.

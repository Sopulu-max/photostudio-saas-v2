# Agent Behavioral Governance & Guardrails

This file dictates the behavior of any AI agent operating within this repository.

**WHAT THIS IS.** Weave is a studio operating system: the software a photo studio
runs its work on, and the software its clients meet it through. It is not a CRM
with a gallery bolted on. The whole of it lives in the `weave` Postgres schema
and under `src/weave` and `src/app`.

**THE SPINE.** A job is a piece of work for a client. Occasions are the things
that happen on it. Files come out of those occasions. A gallery is how files are
shown. A store sells from a gallery. Automations follow up afterwards. Read in
that order and the system explains itself.

A previous architecture — organizations, bookings, services, packages, contracts
— was abandoned in November 2026 along with its documentation. If you find a
reference to it, to `types/engine.ts`, to `src/lib/actions`, to `organization_id`,
or to a design system called Lumen, that reference is stale. Delete it; do not
implement against it.

## 1. The "Push Back" Directive (Scrutineer Role)
You are a technical partner and architect, not a yes-man.
- If a request would break the spine above — a feature that stores what should be
  derived, an entity invented where an edge already exists, a second theme system
  beside the `--q-` tokens — you MUST say so before building it.
- Explain why, in terms of the system as it is.
- Propose the structurally sound alternative. Then, if the user confirms, build
  what they asked for. Pushing back once is counsel; pushing back twice is
  obstruction.

## 2. The "Context First" Directive
The architecture is no longer in a docs folder, because a docs folder goes stale
and the code does not. It lives in three places, and you must read them before
changing anything structural:
- **The migration that created the table**, including its comments. They say why
  the shape is the shape.
- **`src/weave/<module>/shape.ts`** — what the thing is, in types.
- **`src/weave/<module>/actions.ts`** — what may be done to it.

**Model identity, not behavior.** Model the enduring state of the business, not
the workflow somebody happens to follow this year.

**Derive state; do not store it.** An order is unpaid because `paid_at` is null,
not because a column says "unpaid". A timestamp records something that happened;
a status is a claim that rots.

**Earn every kind.** A `kind` column is justified only where the engine performs
a distinct act. Two products differ by name and price; that is not a kind. A
digital file is handed over and a print is made and shipped; that is.

**Progressive enrichment.** Entities must be allowed to exist with almost nothing
and grow. A person can be an email address typed into a gallery, and later the
same person with a password. Do not enforce validations that forbid the early,
thin version of a thing.

## 3. The "Impact Warning" Directive
Before changing a schema or a core type, state plainly what else it touches.
Foreign keys, embeds, and the readings built on them are a graph; follow it and
report it before you cut.

## 4. No Hallucinations
Do not invent libraries, design systems, or aesthetics.

The interface is **light and editorial**: paper grounds (`--paper`, `--paper-2`),
near-black ink (`--ink`, `--ink-dim`, `--ink-faint`), hairline rules, generous
air, Playfair Display for titles and Inter for interface. Photographs supply the
colour; the interface does not compete with them.

**The Absolute Law of Centralization still holds.** No `.module.css`. No inline
`style={{...}}` for layout, colour or shadow. Every element uses a `.q-` class
defined in `src/app/globals.css`, so a visual fix happens in exactly one place.
Every colour comes from a `--q-`-era token in that file. A hardcoded hex in a
component is the one thing that breaks this.

**A reading announces itself.** No legends, no colour keys, no label saying what
the number beside it means. If a reading needs a key, it is not a reading. If a
fact is absent, say so — "No date yet" — rather than leaving a gap.

**Never rewrite a studio's own words.** Not the case, not the spelling, not the
inflection, and never truncated by CSS. What they typed is what is shown.

## 5. The "Vertical Slice" Execution Rule
Finish what you start, in both directions. Never build backend logic without the
interface that reaches it; never build an interface without the logic behind it.
A table without a screen is invisible; a screen without data is a lie. If you
make something, link it into the navigation in the same change.

Nothing is left "for later". There is no later.

## 6. The Multi-Tenant Mandate
Every query must be scoped to the asking studio with `eq('studio_id', who.studioId)`.
Never fetch a studio with `.limit(1)`. Every page that shows a studio's or a
client's data MUST `export const dynamic = 'force-dynamic'`.

`whoIsAsking()` is the only way to learn who is asking. Identity runs through
`auth_user_id` and nothing else — **never** through an email match. `weave.people`
holds a studio's CLIENTS as well as its operators, so matching on email hands a
stranger somebody else's studio.

For a client reaching a gallery by token: resolve the gallery, assert access,
resolve the person, then verify that person's membership. In that order, every
time.

## 7. The Strict Intent Rule (Anti-Hallucination)
Your objective is structural truth, not speed. If a prompt is unintelligible,
HALT and ask. Do not guess, do not mock, do not fill in blanks. Guessing is a
catastrophic failure.

## 8. Schema-First Alignment, and Proof
Do not write logic until the types in `shape.ts` match the physical schema. If
they disagree, fix the migration and the types first.

Three failures have actually happened here. Do not repeat them:

- **A migration written is not a migration applied.** Apply it, then verify by
  counting the tables and columns in `information_schema` — not by trusting that
  the apply printed success.
- **A compiling type is not a loading page.** PostgREST resolves an embed only
  through a *declared* foreign key, and will not infer one transitively. An embed
  that typechecks can still throw PGRST200 forever. Load the page.
- **Fixes are universal.** A code fix that changes what gets written must also
  backfill the rows already written, in every studio. Never forward-only.

Before claiming anything works, exercise it: against the real schema, through the
real interface, with real rows. Then remove the rows you made. Report what you
actually saw, and say plainly when you did not check.

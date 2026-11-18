# Weave

A studio operating system: the software a photo studio runs its work on, and the
software its clients meet it through.

## The spine

A **job** is a piece of work for a client. **Occasions** are the things that
happen on it — the shoot, the review, the delivery. **Files** come out of those
occasions. A **gallery** is how files are shown to the people they are for. A
**store** sells prints and downloads from a gallery. **Automations** follow up
afterwards.

Read it in that order and the system explains itself. Each lives under
`src/weave/<module>`, with `shape.ts` for what a thing is and `actions.ts` for
what may be done to it.

Two interfaces sit on top: the studio's, behind a login, and the client's, at
`/g/<token>`, which needs no account.

## Running it

```bash
npm install
npm run dev
```

It needs a `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_PASSWORD`.

```bash
npx vitest run     # the tests run against the real database
npx tsc --noEmit   # types
```

## The database

Everything lives in the `weave` Postgres schema, inside a Supabase project.
Migrations are in `supabase/migrations`, and their comments carry the reasoning
— why a shape is the shape it is. They are the architecture documentation.

```bash
node scripts/apply-migration.mjs <filename>   # apply one, by basename
node scripts/db-query.mjs "select ..."        # ask the database something
```

A migration that has been written has not been applied. Apply it, then verify by
counting what it should have made.

## Working on it

`.agents/AGENTS.md` holds the binding rules — what to read before changing
anything, how state is modelled, how the interface is kept in one place, and the
multi-tenant mandate. Read it first.

The short version: derive state rather than storing it, scope every query to the
asking studio, finish each feature in both directions at once, and prove a thing
works by exercising it rather than by compiling it.

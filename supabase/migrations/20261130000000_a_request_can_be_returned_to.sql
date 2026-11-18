-- A booking system where the person who asked never learns the answer is not
-- a booking system. Until now a request went in, the studio took it or turned
-- it away, and nothing on the client's side ever changed: they had no page, no
-- record, nothing to come back to.
--
-- So a request gets an address of its own, the same way a gallery does. The
-- answer lives at that address. Email, when it exists, will only ever be a
-- notification pointing here — the state is readable without it, which is what
-- lets the loop close today rather than when a mail provider is wired.
--
-- Only requests get one. A job the studio started itself was never asked for
-- by anybody and has nobody waiting to read it, so the column stays null and
-- the unique index ignores it.
alter table weave.jobs
  add column if not exists request_token text;

create unique index if not exists jobs_request_token_unique
  on weave.jobs (request_token) where request_token is not null;

-- Existing requests, if any are mid-flight, get an address too: a fix that
-- only applies to rows written after it is not a fix.
update weave.jobs
  set request_token = encode(gen_random_bytes(16), 'hex')
  where requested_at is not null and request_token is null;

-- What the studio said back when they answered. Kept beside the answer rather
-- than sent and forgotten, so the client can re-read it and the studio can see
-- what it promised.
alter table weave.jobs
  add column if not exists answered_with text;

notify pgrst, 'reload schema';

-- A booking a client can read.
--
-- The studio's own view of a booking is a management surface: ten sections,
-- most of them about how the work gets done. What a client needs from the same
-- row is a different reading of it — when it is, what they are getting, what
-- they said, and where the money stands.
--
-- The mechanism is the one this app already uses three times: a nullable
-- capability token on the row, minted when somebody decides to share and
-- destroyed when they decide not to. deliveries.share_token opens a gallery,
-- invoices.share_token opens an invoice, financial_transactions.receipt_token
-- opens a receipt. This is the fourth, and it is deliberately the same shape
-- rather than a new idea — a client holding a link should not have to learn
-- which of four kinds of link they are holding.
--
-- NULL IS THE RESTING STATE. A booking is not readable until somebody says so,
-- which is why there is no default here and no backfill below: every booking
-- that already exists stays private until its studio shares it.

alter table bookings
  add column if not exists share_token text,
  add column if not exists shared_at timestamptz;

comment on column bookings.share_token is
  'Capability token for the client-facing reading of this booking. Null means not shared; revoking sets it back to null, which kills the old link.';
comment on column bookings.shared_at is
  'When the current link was minted. Cleared with the token.';

-- Unique so a token can never open two bookings, and partial so the many
-- unshared bookings do not have to be distinct from each other on null.
create unique index if not exists bookings_share_token_key
  on bookings (share_token)
  where share_token is not null;

-- The public page looks a booking up by token alone — it has no organization to
-- scope by, because nobody is signed in. This is the index that read uses.
create index if not exists bookings_share_token_lookup
  on bookings (share_token)
  where share_token is not null;

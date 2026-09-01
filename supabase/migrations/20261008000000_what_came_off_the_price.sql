-- What came off the price, and why the invoice says a smaller number.
--
-- A studio gives ground: a returning client, a slow month, a package sold as a
-- favour. Until now the only way to record it was to type a smaller price onto
-- the booking line, which stores the CONCESSION and the PRICE as one number and
-- can no longer tell them apart. The invoice then says ₦189,000 and nothing
-- anywhere remembers that ₦210,000 was the price and ₦21,000 was given away.
--
-- Shaped exactly like tax, which is the same kind of fact travelling the other
-- direction: what the document was raised under, frozen onto the document.
-- tax_rate and tax_amount are stored rather than derived, and the note on that
-- says why — an amount that depends on a rate which changes would quietly
-- restate a document if it were recomputed later. A discount has the same
-- hazard and takes the same answer.
--
-- Three columns because three different things are true: HOW it was given
-- (a percentage of the work, or a flat sum off), WHAT was said (10, or 20000),
-- and WHAT IT CAME TO on the day (₦21,000). The third cannot be recovered from
-- the first two once the lines change, which is exactly when someone would
-- want to read it.

alter table invoices add column if not exists discount_kind text;
alter table invoices add column if not exists discount_value numeric;
alter table invoices add column if not exists discount_amount numeric not null default 0;

comment on column invoices.discount_kind is
  'How the discount was expressed: "percentage" or "amount". Null when none was given.';
comment on column invoices.discount_value is
  'What the studio said — 10 for ten per cent, or 20000 for a flat sum. Null when none.';
comment on column invoices.discount_amount is
  'What it came to in money on the day this was raised, frozen like tax_amount. Zero when none.';

-- Only the two ways a studio actually gives ground. A null kind is "no
-- discount", which is why the constraint permits it.
alter table invoices drop constraint if exists invoices_discount_kind_check;
alter table invoices add constraint invoices_discount_kind_check
  check (discount_kind is null or discount_kind in ('percentage', 'amount'));

-- A discount is money off, never money on: a negative discount is a price rise
-- wearing the wrong name, and belongs on a line where the client can read it.
alter table invoices drop constraint if exists invoices_discount_amount_check;
alter table invoices add constraint invoices_discount_amount_check
  check (discount_amount >= 0);

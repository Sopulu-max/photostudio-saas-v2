-- A deposit percentage alone can't say "this one is paid in full, no partial
-- option" — 0% is ambiguous with "nothing due yet", and there was no way to
-- lock out a partial payment at all. Payment policy is a closed choice the
-- system reasons about (unlike price_unit or category, which are just labels),
-- so — like booking_stages.kind — it gets a real column with a check
-- constraint rather than living loose in the pricing jsonb.
--
-- 'full' means the deposit percentage is irrelevant (100% is due); the
-- application layer enforces this rather than trusting the stored number.

alter table services add column payment_policy text not null default 'deposit'
  check (payment_policy in ('deposit', 'full'));

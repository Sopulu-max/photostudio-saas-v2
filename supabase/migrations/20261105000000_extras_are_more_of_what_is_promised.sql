-- An extra is more of something the booking's packages already promise.
--
-- Nothing else. The word only has meaning against a promise already made,
-- so the inventory of possible extras is the booking's promises, across
-- every line; taking one raises that promise's count on the booking's
-- instance and records the departure in booking_line_extras (20261104) with
-- the figure agreed for each unit, frozen. The package stays what it was
-- sold as; the ledger says what was added.
--
-- Two earlier readings of "more" leave with this:
--
--   · Rates on VARIABLES (20261104: variables.rate, variables.option_rates).
--     An extra is more of what is promised, not more of what varies; a rate
--     stays only on what a service produces (service_deliverables.rate), as
--     the studio's optional pre-agreed figure for one more. The system never
--     prescribes a pricing model.
--
--   · TIERS on a package (packages.pricing_variant: "1 outfit N / 2 outfits M")
--     and price_unit. Retired by 20260904000001, which was never applied; no
--     package carries either. The tier buttons that read them were dead code
--     and are gone with the columns.
--
-- Contract step: the code stopped reading all of these before this runs.

alter table variables
  drop column if exists rate,
  drop column if exists option_rates;

alter table packages
  drop column if exists pricing_variant,
  drop column if exists price_unit,
  drop column if exists pricing,
  drop column if exists payment_policy;

comment on column service_deliverables.rate is
  'Optional: the studio''s pre-agreed figure for one more of this deliverable when this service makes it beyond what a package promised. Suggests the figure at the desk; never computed into a package''s price.';

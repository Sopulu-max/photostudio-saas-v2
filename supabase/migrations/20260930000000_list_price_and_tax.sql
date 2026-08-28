-- What a package was worth when it was taken, and the tax the studio charges.
--
-- DISCOUNT, DERIVED RATHER THAN DECLARED.
--
-- A booking gets its own instance of a package and the operator may agree a
-- different price on it. That difference IS the discount — there is no need for
-- a discount field, and a stored one would be a second opinion that disagrees
-- with the prices the moment either is edited.
--
-- But deriving it needs something to compare against, and the catalog price is
-- the wrong thing: it moves. A shoot discounted by 20,000 in March would show
-- as discounted by 45,000 after a price rise in June, because the comparison
-- would silently re-baseline. So the instance records what the package was
-- worth AT THE MOMENT IT WAS TAKEN, alongside what was actually agreed.
--
--   discount = list_price − price     (both frozen on the instance)
--
-- instance_of records which catalog package it came from. Provenance, not
-- arithmetic: it answers "what is this an instance of" without the name, which
-- is deliberately identical.
--
-- Both are null on catalog packages. A package that is not an instance of
-- anything has no list price other than its own.
--
-- TAX.
--
-- invoices.tax_rate and tax_amount already exist and have never been written.
-- The rate itself belongs to the studio, not to each document — a studio has
-- one VAT position, and re-declaring it per invoice is how two invoices in the
-- same month end up disagreeing. It lives in the studio's metadata and is
-- SNAPSHOTTED onto each invoice as it is raised, so changing the rate never
-- rewrites a document already sent.

alter table packages
  add column if not exists instance_of uuid references packages(id) on delete set null,
  add column if not exists list_price jsonb;

create index if not exists packages_instance_of on packages (instance_of) where instance_of is not null;

comment on column packages.instance_of is
  'The catalog package this instance was taken from. Null on catalog packages.';
comment on column packages.list_price is
  'What the source package cost at the moment this instance was taken. Frozen, so a later catalog price rise cannot re-baseline the discount.';

comment on column invoices.tax_rate is
  'The studio''s tax rate as it stood when this invoice was raised. Snapshotted, never read live.';
comment on column invoices.tax_amount is
  'Tax on this invoice, computed from its lines at the rate above and frozen with it.';

-- Remove pricing columns from packages as price is determined at booking time.
alter table packages drop column if exists pricing;
alter table packages drop column if exists price_unit;
alter table packages drop column if exists pricing_variant;
alter table packages drop column if exists payment_policy;

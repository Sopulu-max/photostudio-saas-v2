-- Money gains a kind, and void becomes a thing that happens.
--
-- Until now a transaction was a free-text `type` plus a direction. That meant
-- nothing downstream could tell a client's deposit from the studio's rent
-- except by reading a string a human typed, and the Finances page duly added
-- expenses to income because both were "settled".
--
-- `kind` carries the structure; `type` stays exactly as it was, the studio's
-- own label underneath. This is the proliferation rule the services ontology
-- runs on: Rent and Equipment are not kinds of money any more than Wedding is
-- a service — they are values beneath one. Three kinds cover what the system
-- actually needs to branch on:
--
--   charge   money a client owes the studio     (inbound)
--   refund   money going back to a client       (outbound)
--   expense  what running the studio cost       (outbound)
--
-- Direction stays on the row because existing reads use it, but it is now
-- derived from kind on write. An inbound expense is not a thing that can
-- happen, and a model able to express one will eventually contain one.

alter table financial_transactions
    add column if not exists kind text;

alter table financial_transactions
    add column if not exists voided_at timestamptz;

-- Backfill by the same reading the application uses for rows that predate the
-- column, so old and new agree: anything inbound was a charge; anything
-- outbound was a refund if it says so, and a cost otherwise.
update financial_transactions
set kind = case
    when direction = 'inbound' then 'charge'
    when type ilike '%refund%' then 'refund'
    else 'expense'
end
where kind is null;

alter table financial_transactions
    alter column kind set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'financial_transactions_kind_check'
    ) then
        alter table financial_transactions
            add constraint financial_transactions_kind_check
            check (kind in ('charge', 'refund', 'expense'));
    end if;
end $$;

-- The pairing is the invariant worth enforcing in the database rather than
-- only in the module: whatever writes a row, a charge is money coming in and
-- the other two are money going out.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'financial_transactions_kind_direction_check'
    ) then
        alter table financial_transactions
            add constraint financial_transactions_kind_direction_check
            check (
                (kind = 'charge' and direction = 'inbound')
                or (kind in ('refund', 'expense') and direction = 'outbound')
            );
    end if;
end $$;

create index if not exists idx_ft_org_kind on financial_transactions(organization_id, kind);

-- 'created' is in the status check and nothing has ever written it — every
-- path starts at 'pending'. Left alone rather than dropped: removing a value
-- from a check constraint is not worth a migration on a column that already
-- behaves, and a stray legacy row would fail to load.

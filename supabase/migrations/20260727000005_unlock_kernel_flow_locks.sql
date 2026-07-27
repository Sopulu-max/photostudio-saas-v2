-- Unlock the kernel: remove the flow-locks that forced one predetermined order.
--
-- The kernel hardcoded a single sequence (inquiry → contract → work → money) by
-- making relationships mandatory and gating one entity's existence on another's
-- state. That contradicts the constitution (Model Identity Not Behavior;
-- Progressive Enrichment) and locks studios into one way of operating. Real
-- studios shoot before signing, invoice without a contract, write terms with no
-- inquiry. So: entities become independently creatable; relationships are
-- OPTIONAL — valid when present, never required to act.
--
-- What is KEPT: integrity guards (referential integrity when a link EXISTS,
-- tenant scoping, valid state transitions). What is REMOVED: "you cannot do X
-- until Y is in state Z" locks. Convenience cascades (e.g. activate → spawn
-- workflow + deposit) stay in application code as opt-in defaults, not DB laws.

-- 1. Work can exist without a contract.
alter table workflows    alter column contract_id drop not null;
drop trigger if exists tr_enforce_workflow_contract_state on workflows;
drop function if exists enforce_workflow_contract_state();

-- 2. Deliverables can exist without a contract.
alter table deliverables alter column contract_id drop not null;

-- 3. A contract can exist without an inquiry (write terms directly).
alter table contracts    alter column intent_id drop not null;

-- 4. Money can be invoiced without a contract. Keep only the integrity guard
--    (cannot void an already-settled transaction) — drop the contract lock.
create or replace function enforce_financial_transaction_rules()
returns trigger as $$
begin
  if tg_op = 'UPDATE' and new.status = 'voided' and old.status not in ('created', 'pending') then
    raise exception 'Cannot void a transaction that is already settled.';
  end if;
  return new;
end;
$$ language plpgsql;

-- Rename the Agreement entity to Contract across the schema.
--
-- Product decision: "agreement" becomes "contract" everywhere. Postgres carries
-- RLS policies, the updated_at trigger, and FK constraints through a table/column
-- rename automatically — but trigger FUNCTION bodies reference the old names as
-- text and must be recreated. Data is preserved (metadata-only renames).

-- 1. The table
alter table agreements rename to contracts;

-- 2. FK columns on dependent tables
alter table workflows                rename column agreement_id to contract_id;
alter table deliverables             rename column agreement_id to contract_id;
alter table financial_transactions   rename column agreement_id to contract_id;

-- 3. Indexes (cosmetic, but keep names truthful)
alter index idx_agreements_org         rename to idx_contracts_org;
alter index idx_agreements_person      rename to idx_contracts_person;
alter index idx_agreements_status      rename to idx_contracts_status;
alter index idx_workflows_agreement    rename to idx_workflows_contract;
alter index idx_deliverables_agreement rename to idx_deliverables_contract;
alter index idx_ft_agreement           rename to idx_ft_contract;

-- 4. Recreate the state-guard function whose body referenced the old table/column.
--    A workflow may only be created for an active/completed contract.
drop trigger if exists tr_enforce_workflow_agreement_state on workflows;
drop function if exists enforce_workflow_agreement_state();

create or replace function enforce_workflow_contract_state()
returns trigger as $$
declare
  v_contract_status text;
begin
  if new.contract_id is not null then
    select status into v_contract_status from contracts where id = new.contract_id;

    if v_contract_status not in ('active', 'completed') then
      raise exception 'A Workflow can only be created for an active or completed Contract. Current status: %', v_contract_status;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger tr_enforce_workflow_contract_state
  before insert on workflows
  for each row
  execute function enforce_workflow_contract_state();

-- 5. The inbound-transaction guard keeps its name and trigger; only its body
--    referenced agreement_id, so replace the body in place.
create or replace function enforce_financial_transaction_rules()
returns trigger as $$
begin
  if new.direction = 'inbound' and new.contract_id is null then
    raise exception 'Inbound financial transactions must be tied to a Contract.';
  end if;

  -- Cannot transition directly to voided if it wasn't created/pending
  if tg_op = 'UPDATE' and new.status = 'voided' and old.status not in ('created', 'pending') then
    raise exception 'Cannot void a transaction that is already settled.';
  end if;

  return new;
end;
$$ language plpgsql;

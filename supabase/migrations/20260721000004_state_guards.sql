-- 20260721000004_state_guards.sql

-- 1. Trigger to ensure a Workflow is only created if the Agreement is active or completed.
CREATE OR REPLACE FUNCTION enforce_workflow_agreement_state()
RETURNS TRIGGER AS $$
DECLARE
  v_agreement_status text;
BEGIN
  IF NEW.agreement_id IS NOT NULL THEN
    SELECT status INTO v_agreement_status FROM agreements WHERE id = NEW.agreement_id;
    
    IF v_agreement_status NOT IN ('active', 'completed') THEN
      RAISE EXCEPTION 'A Workflow can only be created for an active or completed Agreement. Current status: %', v_agreement_status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_enforce_workflow_agreement_state
  BEFORE INSERT ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION enforce_workflow_agreement_state();

-- 2. Trigger to ensure an inbound Financial Transaction (Invoice) is tied to an Agreement
CREATE OR REPLACE FUNCTION enforce_financial_transaction_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.agreement_id IS NULL THEN
    RAISE EXCEPTION 'Inbound financial transactions must be tied to an Agreement.';
  END IF;

  -- Cannot transition directly to voided if it wasn't created/pending
  IF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status NOT IN ('created', 'pending') THEN
    RAISE EXCEPTION 'Cannot void a transaction that is already settled.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_enforce_financial_transaction_rules
  BEFORE INSERT OR UPDATE ON financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_financial_transaction_rules();

-- 3. Trigger: Intent cannot be updated to 'approved' if it lacks a Person or Service Template
CREATE OR REPLACE FUNCTION enforce_intent_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    IF NEW.person_id IS NULL THEN
      RAISE EXCEPTION 'Cannot approve an Intent without a Person attached.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_enforce_intent_approval
  BEFORE UPDATE ON intents
  FOR EACH ROW
  EXECUTE FUNCTION enforce_intent_approval();

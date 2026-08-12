-- Receipts: one per payment, not one per invoice.
--
-- The last pass argued a receipt is just an invoice answering "have I been
-- paid?". That holds only when an invoice is settled in full. A client paying
-- a ₦50,000 deposit against a ₦135,000 invoice is owed an acknowledgement of
-- *that payment*, today, while the invoice is still outstanding. So one
-- invoice has many receipts, each about a different fact.
--
-- But a receipt is not a new fact either. The payment already records the
-- amount, the date, the payer and the invoice it belongs to. A receipts table
-- would copy all of that and then disagree with it the first time one side is
-- edited. What a receipt adds is only what makes it a *document*: its own
-- number, when it was issued, and the client's link to it. Those go on the
-- payment.

alter table financial_transactions
    add column if not exists receipt_number     text,
    add column if not exists receipt_issued_at  timestamptz,
    add column if not exists receipt_token      text unique;

create index if not exists idx_ft_receipt_token on financial_transactions(receipt_token);

-- Its own sequence: invoices and receipts are numbered independently, because
-- INV-0007 and RCT-0007 describe different things and a shared counter would
-- make the gaps in each look like lost documents.
alter table organizations
    add column if not exists receipt_seq integer not null default 0;

-- One counter-taker for both, so there is a single atomic path to a document
-- number rather than a function per document type. UPDATE ... RETURNING locks
-- the row, so two operators cannot take the same number.
create or replace function next_document_number(org uuid, kind text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    n integer;
begin
    if kind = 'invoice' then
        update organizations set invoice_seq = invoice_seq + 1
        where id = org returning invoice_seq into n;
    elsif kind = 'receipt' then
        update organizations set receipt_seq = receipt_seq + 1
        where id = org returning receipt_seq into n;
    else
        raise exception 'Unknown document kind: %', kind;
    end if;
    return n;
end;
$$;

revoke all on function next_document_number(uuid, text) from public, anon, authenticated;

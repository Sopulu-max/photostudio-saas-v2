-- Money against a draft issues it.
--
-- A draft is not yet a document: no number, lines still following the
-- booking. Yet every booking taken with money down recorded that money
-- against its draft, and the page read "Draft invoice" and "Paid in full"
-- in one breath. A payment says the bill was presented and met; from here
-- the code issues a draft before recording money against it, and this
-- issues every draft that already holds settled money - oldest first, so
-- the numbers follow the order the money came in, and dated when the first
-- payment landed, which is the latest it can have been presented.
--
-- The line rows are left as they stand: they were frozen by being paid.

do $$
declare
  r record;
  seq integer;
begin
  for r in
    select i.id, i.organization_id,
      (select min(t.settled_at) from financial_transactions t
        where t.invoice_id = i.id and t.status = 'settled' and t.direction = 'inbound') as first_paid
    from invoices i
    where i.status = 'draft' and i.voided_at is null
      and exists (select 1 from financial_transactions t
                  where t.invoice_id = i.id and t.status = 'settled' and t.direction = 'inbound')
    order by i.created_at
  loop
    seq := next_invoice_number(r.organization_id);
    update invoices
    set number = 'INV-' || lpad(seq::text, 4, '0'),
        status = 'issued',
        issued_at = coalesce(r.first_paid, now()),
        share_token = coalesce(share_token, replace(gen_random_uuid()::text, '-', ''))
    where id = r.id;
  end loop;
end $$;

-- And a draft whose booking is gone is nothing: it was a reading of that
-- booking, and there is no booking to read. Only drafts, and only where no
-- money was ever recorded against them - an issued document outlives its
-- booking, since a client holds it.
delete from invoice_lines
where invoice_id in (
  select i.id from invoices i
  where i.status = 'draft' and i.booking_id is null
    and not exists (select 1 from financial_transactions t where t.invoice_id = i.id));
delete from invoices i
where i.status = 'draft' and i.booking_id is null
  and not exists (select 1 from financial_transactions t where t.invoice_id = i.id);

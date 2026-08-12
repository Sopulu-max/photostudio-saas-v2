-- Taking the next invoice number, atomically.
--
-- Read-then-write from the application would let two operators issuing at the
-- same moment both read 6 and both write 7, and duplicate invoice numbers are
-- the kind of thing an accountant finds a year later. A single UPDATE ...
-- RETURNING is atomic: the row is locked for the duration, so the second call
-- waits and gets 8.
--
-- SECURITY DEFINER so it runs with the owner's rights regardless of who calls
-- it; the organization is passed explicitly and the caller only ever reaches it
-- through the module, which resolves the org from the session.

create or replace function next_invoice_number(org uuid)
returns integer
language sql
security definer
set search_path = public
as $$
    update organizations
    set invoice_seq = invoice_seq + 1
    where id = org
    returning invoice_seq;
$$;

revoke all on function next_invoice_number(uuid) from public, anon, authenticated;

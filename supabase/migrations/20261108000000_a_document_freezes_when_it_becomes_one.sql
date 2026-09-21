-- A document freezes when it becomes one.
--
-- An invoice and a contract are both raised from the booking and both froze
-- at the moment they were raised. Neither is a document yet at that moment:
-- an invoice becomes one when it is ISSUED, a contract when it is SIGNED.
-- Until then each is a reading of the booking. Frozen early, an extra added
-- a minute after booking reached the booking's own total and its promise
-- and nothing else - the draft invoice still said 20,000, the proposed
-- contract still said 20,000, and the page read "Agreed" off the contract,
-- so the extra vanished from the money entirely.
--
-- A draft invoice follows the line it carries: an extra taken on that line
-- is a row of its own on the draft, found again by this column so it can be
-- taken off again. Issued invoices are never touched (set null, not
-- cascade): a document the client holds does not change under them; what is
-- uninvoiced shows as left to invoice.

alter table invoice_lines
  add column if not exists booking_line_extra_id uuid references booking_line_extras(id) on delete set null;

comment on column invoice_lines.booking_line_extra_id is
  'The extra this row bills, when it bills one. A draft keeps in step with the booking through it; an issued invoice keeps the row whatever happens to the extra.';

-- Every draft raised before this: give it the extras its lines already carry.
insert into invoice_lines (organization_id, invoice_id, booking_line_id, booking_line_extra_id, description, quantity, unit_price, amount, position)
select
  i.organization_id, i.id, x.booking_line_id, x.id,
  coalesce(nullif(split_part(il.description, ' · ', 1), ''), 'Booking line') || ' · ' || x.label,
  x.units,
  (x.unit_rate->>'base_price')::numeric,
  (x.unit_rate->>'base_price')::numeric * x.units,
  (select coalesce(max(position), 0) + 1 from invoice_lines m where m.invoice_id = i.id)
from invoices i
join invoice_lines il on il.invoice_id = i.id and il.booking_line_extra_id is null
join booking_line_extras x on x.booking_line_id = il.booking_line_id
where i.status = 'draft' and i.voided_at is null
  and not exists (select 1 from invoice_lines e where e.invoice_id = i.id and e.booking_line_extra_id = x.id);

-- And every proposed contract: its figures follow the booking until signed.
-- The extras are appended as items and the base price becomes the booking's.
with priced as (
  select c.id as contract_id,
    (select coalesce(sum(coalesce((p.price->>'base_price')::numeric, (l.price->>'base_price')::numeric, 0) * coalesce(l.quantity, 1)), 0)
       from booking_lines l left join packages p on p.id = l.package_id where l.booking_id = c.booking_id)
    + (select coalesce(sum((x.unit_rate->>'base_price')::numeric * x.units), 0)
       from booking_line_extras x join booking_lines l on l.id = x.booking_line_id where l.booking_id = c.booking_id) as total,
    (select jsonb_agg(jsonb_build_object(
        'title', coalesce(p.name, l.title, 'Booking line') || ' · ' || x.label,
        'quantity', x.units, 'unit', null,
        'unitPrice', (x.unit_rate->>'base_price')::numeric,
        'total', (x.unit_rate->>'base_price')::numeric * x.units))
       from booking_line_extras x join booking_lines l on l.id = x.booking_line_id left join packages p on p.id = l.package_id
       where l.booking_id = c.booking_id) as extra_items
  from contracts c
  where c.status = 'proposed'
    and exists (select 1 from booking_line_extras x join booking_lines l on l.id = x.booking_line_id where l.booking_id = c.booking_id)
)
update contracts c
set terms = jsonb_set(
      jsonb_set(c.terms, '{base_price}', to_jsonb(priced.total)),
      '{line_items}',
      (select coalesce(jsonb_agg(it), '[]'::jsonb) from jsonb_array_elements(coalesce(c.terms->'line_items', '[]'::jsonb)) it
         where it->>'title' not like '% · +%')
      || coalesce(priced.extra_items, '[]'::jsonb))
from priced
where c.id = priced.contract_id;

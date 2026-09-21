-- An invoice row says what it is for, once.
--
-- A package's row was its name followed by every configuration value - so
-- a family member called "2 outfits · Softcopy" printed "· 2 outfits" again
-- after itself, and the row read as typed in. An extra's row was prefixed
-- with the package's name, so it read as a second package. From here a row
-- is the package's name and only what the booking answered; an extra's row
-- is its own label, under the package's row.
--
-- The figures on every row are untouched. This restates the text the same
-- way the code now composes it, from the same sources, on every row that
-- still has them - an issued document's amounts are frozen; its wording
-- was never the client's to hold, only ours to have written badly.

-- Extras: the label alone, kept from the end of the old text.
update invoice_lines il
set description = x.label || coalesce(substring(il.description from ' — .*$'), '')
from booking_line_extras x
where il.booking_line_extra_id = x.id
  and il.description like '%' || x.label || '%'
  and il.description <> x.label || coalesce(substring(il.description from ' — .*$'), '');

-- Packages: the name, then the values the booking answered - not what the
-- package fixed, which its name already says - then any " — label" the row
-- carried.
with composed as (
  select il.id,
    coalesce(p.name, l.title, 'Booking line')
    || coalesce((
      select ' · ' || string_agg(
        case
          when v.kind = 'number' and v.unit is not null then
            trim(to_char(bv.value::text::numeric, 'FM9999999990.##')) || ' ' || v.unit
              || case when bv.value::text::numeric = 1 then '' else 's' end
          else trim(both '"' from bv.value::text)
        end, ' · ' order by v.position)
      from booking_line_variable_values bv join variables v on v.id = bv.variable_id
      where bv.booking_line_id = l.id and bv.value is not null
        and trim(both '"' from bv.value::text) <> ''
        -- not what the package fixed: that is already in its name
        and not exists (
          select 1 from package_variable_values pvv
          join package_services ps on ps.id = pvv.package_service_id
          where ps.package_id = l.package_id and pvv.variable_id = bv.variable_id and pvv.answered_by = 'studio')
    ), '')
    || coalesce(substring(il.description from ' — .*$'), '') as text
  from invoice_lines il
  join booking_lines l on l.id = il.booking_line_id
  left join packages p on p.id = l.package_id
  where il.booking_line_extra_id is null
)
update invoice_lines il
set description = composed.text
from composed
where il.id = composed.id and il.description <> composed.text;

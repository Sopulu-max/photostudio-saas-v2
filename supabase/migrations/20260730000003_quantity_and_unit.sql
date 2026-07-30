-- Quantity, and what a price is per.
--
-- A booking line had a title and a price and nothing else, so "3 hours",
-- "2 photographers" and "150 prints" could not be expressed at all. A studio had
-- to bake the number into a custom line and lose the arithmetic.
--
-- Split across the two layers, as ever:
--   · services.price_unit — what the price is PER ("hour", "person", "image").
--     Null means a flat price, which is most services. Free text on purpose:
--     the system never reasons about the unit, it only labels the number, so a
--     fixed vocabulary would only get in the way.
--   · booking_lines.quantity — how many, on THIS line. Numeric, so 1.5 hours
--     works. Defaults to 1, which is what every existing line means today.
--
-- The line total is price × quantity. Anything that sums line prices must
-- multiply — the contract total is the one that would silently under-bill.

alter table services add column price_unit text;
alter table booking_lines add column quantity numeric not null default 1;

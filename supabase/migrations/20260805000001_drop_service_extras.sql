-- Removing Extras entirely — not a redesign, a retraction. The concept (a
-- service-attached list of add-ons, surfaced as a raw checkbox list to the
-- client and collapsing into an untyped booking line) didn't hold up. Nothing
-- downstream depends on the table: a chosen extra was always snapshotted into
-- an ordinary booking_lines row at add-time (title/price copied in, no FK),
-- so dropping this table does not touch any booking, line, or invoice that
-- already exists — it only removes the ability to define and offer new ones.
drop table if exists service_extras;

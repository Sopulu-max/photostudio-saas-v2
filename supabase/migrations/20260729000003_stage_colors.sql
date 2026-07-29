-- A studio picks its own colour per stage.
--
-- Null means "use the sensible default for this kind", so existing stages keep
-- looking right and a new stage doesn't have to choose. The value is a palette
-- NAME (amber, green, blue…), never a hex — the token behind it flips with the
-- theme, so a chosen colour stays legible in light and dark.
alter table booking_stages add column color text;

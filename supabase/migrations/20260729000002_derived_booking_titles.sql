-- A booking's name is derived, not typed.
--
-- Studios don't invent titles for jobs — they know who it's for, what they want
-- and when. The name is a label the system composes from those facts ("Amara
-- Obi — Studio Headshots"), and keeps correct as they change.
--
-- title_custom marks a name the studio claimed for itself (a wedding might
-- warrant "Okafor wedding — Saturday"). Once claimed, auto-naming leaves it be.
alter table bookings add column title_custom boolean not null default false;

-- Existing bookings keep the names they have, but as derived ones: they were
-- generated the same way (client — service), so let the module maintain them.

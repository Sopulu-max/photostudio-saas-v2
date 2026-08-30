-- Where the cover should be looking.
--
-- A cover is drawn 16:9 on a card and 3:1 across the top of a page, and almost
-- no photograph is either of those shapes. Something is always cropped away,
-- and a centred crop is only right by accident — a portrait framed the way a
-- portrait is framed loses the face first, which is the one thing on it that
-- mattered.
--
-- Stored as a CSS background-position, which is what it is: "50% 30%". Null
-- means centred, which is what every existing cover was already doing, so
-- nothing changes for anything already uploaded.
--
-- It belongs beside the URL rather than in a settings table because it is a
-- fact about this picture in this frame, meaningless apart from the picture and
-- worthless if the picture is replaced.
alter table packages add column if not exists cover_position text;

comment on column packages.cover_position is
  'CSS background-position for the cover, e.g. "50% 30%". Null means centred.';

-- A gallery opens with a picture.
--
-- A delivery could be named but not shown. The client's first impression was a
-- text heading over a grid of thumbnails, which is a file list, not a gallery.
-- The studio picks one of the delivery's own images to open with.
--
-- It points at the delivery_asset link rather than the asset: a cover is a
-- statement about this bundle, not about the photograph, and unlinking the file
-- from the delivery should quietly retire the cover with it.

alter table deliveries
  add column if not exists cover_asset_id uuid
    references delivery_assets(id) on delete set null;

create index if not exists idx_deliveries_cover on deliveries(cover_asset_id);

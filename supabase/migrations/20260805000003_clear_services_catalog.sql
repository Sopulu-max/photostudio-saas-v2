-- Clearing the Services catalog to nothing, ahead of rebuilding the
-- definition flow from scratch. Not a schema change — the tables stay
-- exactly as they are, since the shape already matches where the rebuild is
-- headed; only the data goes.
--
-- Order matters: services must go first. booking_lines.service_id and
-- intents.service_id are both `on delete set null` — an existing booking
-- keeps its line and its snapshotted price, it just loses the link back to
-- a definition (identical to what already happens when a service is
-- retired). services.default_blueprint_id has no such FK action, so a
-- blueprint can't be deleted while a service still points at it — clearing
-- services first is what makes clearing blueprints possible afterwards.
delete from services;
delete from blueprints;
delete from service_categories;

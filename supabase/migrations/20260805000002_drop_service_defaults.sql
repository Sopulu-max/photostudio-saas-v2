-- Removing the org-wide "service defaults" (payment policy + deposit %) —
-- part of the same retraction as Extras, ahead of rebuilding Services from
-- scratch. This was never its own column, just a bag inside
-- organizations.metadata.services; strip the key rather than leave dead data
-- sitting in every org row now that nothing reads or writes it.
update organizations set metadata = metadata - 'services' where metadata ? 'services';

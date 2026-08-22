-- Ordering belongs to the bundle, not to the link.
--
-- package_workflows carried its own position back when it hung off the package
-- and had to say something about sequence. Since 20260909000000 it hangs off a
-- bundled service, and the order production runs in is the order the services
-- were bundled — package_services.position. The column survived that migration
-- NOT NULL with a default of 0, which means every row now claims the same
-- position and nothing reads it. A column that is always 0 and always ignored
-- is worse than an absent one: the next reader will believe it.

alter table package_workflows drop column if exists position;

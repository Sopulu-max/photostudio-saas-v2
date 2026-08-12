-- Repairs the previous migration, which silently destroyed output types.
--
-- deliverables still carried deliverables_organization_id_name_key — a unique
-- index on (organization_id, name) from when output types were studio-wide.
-- The per-domain duplication used "on conflict do nothing", so the first copy
-- of every name collided with the original and was skipped; then the cleanup
-- deleted the originals it thought it had already copied. Nothing errored and
-- every output type went.
--
-- The lesson worth keeping: "on conflict do nothing" plus a delete of the
-- source is a data-destroying pair. The conflict clause is there to make a
-- migration re-runnable, and it silently converted a failed copy into a
-- successful-looking one. A copy-then-delete must count what it copied.
--
-- Nothing real was lost — this database has no live studio data yet — but the
-- same migration against a real studio would have wiped its vocabulary.

-- The stale constraint is what caused it, and is wrong now regardless: a name
-- is unique within a domain, not within a studio. Photography and Printing may
-- both produce "Proofs" and mean different things.
alter table deliverables drop constraint if exists deliverables_organization_id_name_key;

-- Re-seed what a domain is known to produce, from the same curated library the
-- service templates draw on. A studio's own additions are theirs to make; this
-- is only the floor, so no domain starts blank.
insert into deliverables (organization_id, name, service_domain_id)
select sd.organization_id, v.name, sd.id
from service_domains sd
join (values
    ('Photography',   'Edited photographs'),
    ('Photography',   'RAW images'),
    ('Photography',   'Printed photographs'),
    ('Photography',   'Restored photographs'),
    ('Photography',   'Digital scans'),
    ('Photography',   'Developed negatives'),
    ('Videography',   'Edited video'),
    ('Videography',   'RAW footage'),
    ('Videography',   'Restored video'),
    ('Videography',   'Digital transfer'),
    ('Videography',   'Live stream recording'),
    ('Printing',      'Fine art print'),
    ('Printing',      'Framed print'),
    ('Graphic Design','Designed album'),
    ('Graphic Design','Logo files'),
    ('Graphic Design','Brand guidelines'),
    ('Graphic Design','Print-ready artwork')
) as v(domain, name) on lower(v.domain) = lower(sd.name)
on conflict do nothing;

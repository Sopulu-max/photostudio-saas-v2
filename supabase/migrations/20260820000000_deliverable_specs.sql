-- Six edited photographs. A thirty-second video. A 20x30 frame.
--
-- package_deliverables was (package_id, deliverable_id) and nothing else, so a
-- package could say it includes "Edited photographs" and never how many. The
-- specification is the part a client actually reads, and it had nowhere to live.
--
-- It belongs to the package, not the service: a service says what kind of thing
-- it produces, and a package is where things get specific. Portrait Photography
-- produces edited photographs; the Silver package is what says six of them.
--
-- Distinct from service_variables, which describe the *work* — outfits, coverage
-- hours, revisions. Those are parameters a package fixes or leaves open for the
-- client to answer. This is the deliverable itself, quantified: what arrives.

alter table package_deliverables
    -- How many. Null means unquantified, which is a real answer: "edited
    -- photographs, as many as are good" is how some studios sell.
    add column if not exists quantity numeric(12, 2),
    -- What the quantity counts, when it isn't just a count: 'second', 'minute',
    -- 'page', 'print'. Null reads as plain multiples of the deliverable.
    add column if not exists unit text,
    -- Free text for the specs that aren't quantities — 20x30, matte, A3,
    -- 4K. Deliberately unbounded: the shapes a studio sells are its own.
    add column if not exists spec text;

comment on column package_deliverables.quantity is
    'How many of this deliverable the package includes. Null = unquantified.';
comment on column package_deliverables.unit is
    'What the quantity counts when not a plain multiple — second, minute, page.';
comment on column package_deliverables.spec is
    'Non-quantity specification — 20x30, matte, 4K. Free text by design.';

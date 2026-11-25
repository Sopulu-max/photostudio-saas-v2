-- A package already produces a gallery. It could not say what that gallery
-- LOOKS LIKE, so the one born at acceptance came out blank: no cover style,
-- no theme, and — worse — no sections at all, which `fillGallery` requires
-- before a single picture can go in. The studio had to finish by hand the
-- thing the package was supposed to make.
--
-- Gallery templates already exist, with their own sections, their own design
-- and their own editing. So this is an EDGE, not a new entity: a package
-- names the template its galleries start from. One template can serve several
-- packages, a package that names none still works, and nothing about a
-- template has to be re-stated here.
--
-- WHAT THIS TOUCHES. `weave.packages` gains a nullable column, so every
-- reading of a package widens by one field: the packages page, the public
-- storefront's list, and `galleryForAcceptedJob`, which is where it does its
-- work. Deleting a gallery template must not delete the packages that point
-- at it, hence `on delete set null` — the package survives and simply stops
-- saying what shape it makes.
--
-- NOT A SNAPSHOT HERE, AND DELIBERATELY. The copy happens one step later: a
-- gallery copies its design and sections in at the moment it is created, the
-- same way `makeGallery` already does. So editing a template changes what
-- FUTURE galleries look like and cannot reach into one a client is already
-- looking at. The reference is live; what it produces is frozen.
alter table weave.packages
  add column if not exists gallery_template_id uuid
    references weave.gallery_templates(id) on delete set null;

-- Read when a template is deleted, and when the packages page lists what each
-- package makes.
create index if not exists packages_gallery_template
  on weave.packages (gallery_template_id)
  where gallery_template_id is not null;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

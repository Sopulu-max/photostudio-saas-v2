alter table packages add column if not exists is_family boolean not null default false;
alter table packages drop constraint if exists packages_member_not_family;
alter table packages add constraint packages_member_not_family check (not (is_family and member_of is not null));

comment on column packages.is_family is 'True if this package is explicitly designated as a family, allowing it to exist as a family even before any decisions are left to its members.';

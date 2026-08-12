-- A service domain classifies. It doesn't declare.
--
-- These six tables held a "DNA" for each service parent — the deliverables and
-- dimensions its services were supposed to inherit — edited on a page that
-- promised "any services created under this domain will inherit these
-- properties."
--
-- Nothing ever read them. The suggestions a service editor offers are built by
-- buildDeliverableSuggestions and buildDimensionSuggestions, and both work from
-- the template library plus the services the studio has actually created. That
-- is the better source: knowledge earned from real work rather than declared in
-- a form once and then quietly ignored.
--
-- Output types in particular belong to the service, not the parent. A domain
-- cannot sensibly say what its services produce — Portrait Photography and
-- Film Developing are both Photography and share no output between them.
-- Services keep their own via service_deliverables and primary_deliverable_id;
-- the relationship to the domain stays as services.service_domain_id, which is
-- what "defined in relation to a domain" actually means.
--
-- Dropping rather than leaving them empty: an unread table is a standing
-- invitation to write to it, and the next person to find one would reasonably
-- assume it means something.

drop table if exists service_domain_deliverables;
drop table if exists service_domain_occasions;
drop table if exists service_domain_contexts;
drop table if exists service_domain_subjects;
drop table if exists service_domain_purposes;
drop table if exists service_domain_client_types;

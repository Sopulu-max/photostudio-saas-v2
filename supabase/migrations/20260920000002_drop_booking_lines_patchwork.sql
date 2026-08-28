-- 1. Drop the obsolete columns from booking_lines
-- Since the package is now cloned on booking, the custom package holds its own name and price.
-- The defensive snapshot on booking_lines is no longer needed.

alter table booking_lines
  drop column title,
  drop column price;
